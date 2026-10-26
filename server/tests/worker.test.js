import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { getPrismaClient } from '../src/db/prisma.js';
import { deliveryService } from '../src/services/deliveryService.js';
import { queueService } from '../src/services/queueService.js';
import { verifySignature } from '../src/lib/crypto.js';
import { config } from '../src/config/index.js';

describe('Webhook Delivery Worker & Engine', () => {
  let mockServer;
  let mockServerUrl;
  let serverHandler = () => {};

  beforeAll(async () => {
    // Start local mock HTTP server
    mockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        serverHandler(req, res, body);
      });
    });

    await new Promise((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        const port = mockServer.address().port;
        mockServerUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (mockServer) {
      await new Promise((resolve) => mockServer.close(resolve));
    }
  });

  it('successfully delivers webhook, verifies headers & HMAC signature, and updates status to DELIVERED', async () => {
    const prisma = getPrismaClient();

    let capturedHeaders = null;
    let capturedBody = null;

    serverHandler = (req, res, body) => {
      capturedHeaders = req.headers;
      capturedBody = body;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    };

    // Create endpoint
    const endpoint = await prisma.endpoint.create({
      data: {
        id: 'ep_worker_success',
        name: 'Worker Success Test',
        destinationUrl: `${mockServerUrl}/webhook`,
        signingSecret: 'whsec_abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        maxRetries: 3,
        enabled: true
      }
    });

    // Create queued event
    const event = await prisma.event.create({
      data: {
        id: 'evt_worker_success',
        endpointId: endpoint.id,
        eventType: 'invoice.created',
        payload: JSON.stringify({ invoice_id: 'inv_123', total: 5000 }),
        status: 'DELIVERING',
        attempts: 0,
        maxRetries: 3,
        nextAttemptAt: new Date(),
        lockedAt: new Date()
      }
    });

    const result = await deliveryService.deliverEvent(event);

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);

    // Verify received headers
    expect(capturedHeaders['x-hookrelay-event-id']).toBe(event.id);
    expect(capturedHeaders['x-hookrelay-event-type']).toBe('invoice.created');
    expect(capturedHeaders['x-hookrelay-delivery-attempt']).toBe('1');
    expect(capturedHeaders).toHaveProperty('x-hookrelay-signature');

    // Verify HMAC-SHA256 signature against received body
    const isValidSignature = verifySignature(
      capturedBody,
      capturedHeaders['x-hookrelay-signature'],
      endpoint.signingSecret
    );
    expect(isValidSignature).toBe(true);

    // Verify received envelope format
    const parsedEnvelope = JSON.parse(capturedBody);
    expect(parsedEnvelope.event_id).toBe(event.id);
    expect(parsedEnvelope.event_type).toBe('invoice.created');
    expect(parsedEnvelope.data).toEqual({ invoice_id: 'inv_123', total: 5000 });
    expect(parsedEnvelope).toHaveProperty('timestamp');

    // Verify DB update
    const updatedEvent = await prisma.event.findUnique({
      where: { id: event.id },
      include: { deliveryAttempts: true }
    });

    expect(updatedEvent.status).toBe('DELIVERED');
    expect(updatedEvent.attempts).toBe(1);
    expect(updatedEvent.lockedAt).toBeNull();
    expect(updatedEvent.deliveryAttempts.length).toBe(1);

    const attempt = updatedEvent.deliveryAttempts[0];
    expect(attempt.attemptNumber).toBe(1);
    expect(attempt.statusCode).toBe(200);
    expect(attempt.responseBody).toContain('{"status":"ok"}');
    expect(attempt.latencyMs).toBeGreaterThanOrEqual(0);
    expect(attempt.errorMessage).toBeNull();
  });

  it('handles retryable HTTP 500 failure and schedules exponential backoff retry', async () => {
    const prisma = getPrismaClient();

    serverHandler = (req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Database connection failed' }));
    };

    const endpoint = await prisma.endpoint.create({
      data: {
        id: 'ep_worker_retry',
        name: 'Worker Retry Test',
        destinationUrl: `${mockServerUrl}/fail`,
        signingSecret: 'whsec_retry1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        maxRetries: 3,
        enabled: true
      }
    });

    const event = await prisma.event.create({
      data: {
        id: 'evt_worker_retry',
        endpointId: endpoint.id,
        eventType: 'payment.process',
        payload: JSON.stringify({ orderId: 44 }),
        status: 'DELIVERING',
        attempts: 0,
        maxRetries: 3,
        nextAttemptAt: new Date(),
        lockedAt: new Date()
      }
    });

    const result = await deliveryService.deliverEvent(event);

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(true);

    // Verify DB
    const updatedEvent = await prisma.event.findUnique({
      where: { id: event.id },
      include: { deliveryAttempts: true }
    });

    expect(updatedEvent.status).toBe('RETRYING');
    expect(updatedEvent.attempts).toBe(1);
    expect(new Date(updatedEvent.nextAttemptAt).getTime()).toBeGreaterThan(Date.now());
    expect(updatedEvent.deliveryAttempts.length).toBe(1);

    const attempt = updatedEvent.deliveryAttempts[0];
    expect(attempt.statusCode).toBe(500);
    expect(attempt.errorMessage).toContain('HTTP 500');
  });

  it('handles non-retryable HTTP 404 failure by transitioning to FAILED immediately', async () => {
    const prisma = getPrismaClient();

    serverHandler = (req, res) => {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint Not Found' }));
    };

    const endpoint = await prisma.endpoint.create({
      data: {
        id: 'ep_worker_404',
        name: 'Worker 404 Test',
        destinationUrl: `${mockServerUrl}/notfound`,
        signingSecret: 'whsec_4041234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        maxRetries: 5,
        enabled: true
      }
    });

    const event = await prisma.event.create({
      data: {
        id: 'evt_worker_404',
        endpointId: endpoint.id,
        eventType: 'order.cancel',
        payload: JSON.stringify({ id: 1 }),
        status: 'DELIVERING',
        attempts: 0,
        maxRetries: 5,
        nextAttemptAt: new Date(),
        lockedAt: new Date()
      }
    });

    const result = await deliveryService.deliverEvent(event);

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(false);

    const updatedEvent = await prisma.event.findUnique({
      where: { id: event.id }
    });

    expect(updatedEvent.status).toBe('FAILED');
    expect(updatedEvent.attempts).toBe(1);
  });

  it('marks event as FAILED when max retries are exhausted', async () => {
    const prisma = getPrismaClient();

    serverHandler = (req, res) => {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Service Unavailable');
    };

    const endpoint = await prisma.endpoint.create({
      data: {
        id: 'ep_worker_exhaust',
        name: 'Exhaust Test',
        destinationUrl: `${mockServerUrl}/exhaust`,
        signingSecret: 'whsec_exhaust1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        maxRetries: 2,
        enabled: true
      }
    });

    // Event has already had 1 attempt, maxRetries is 2. This will be attempt 2 (the final attempt).
    const event = await prisma.event.create({
      data: {
        id: 'evt_worker_exhaust',
        endpointId: endpoint.id,
        eventType: 'exhaust.test',
        payload: JSON.stringify({}),
        status: 'DELIVERING',
        attempts: 1,
        maxRetries: 2,
        nextAttemptAt: new Date(),
        lockedAt: new Date()
      }
    });

    const result = await deliveryService.deliverEvent(event);

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(false);

    const updatedEvent = await prisma.event.findUnique({
      where: { id: event.id }
    });

    expect(updatedEvent.status).toBe('FAILED');
    expect(updatedEvent.attempts).toBe(2);
  });

  it('handles request timeout cleanly', async () => {
    const prisma = getPrismaClient();

    // Temporarily reduce delivery timeout for test speed
    const originalTimeout = config.worker.deliveryTimeoutMs;
    config.worker.deliveryTimeoutMs = 150; // 150ms timeout

    serverHandler = (req, res) => {
      // Intentionally do not respond to trigger timeout
      setTimeout(() => {
        if (!res.writableEnded) {
          res.writeHead(200);
          res.end('too late');
        }
      }, 500);
    };

    const endpoint = await prisma.endpoint.create({
      data: {
        id: 'ep_worker_timeout',
        name: 'Timeout Test',
        destinationUrl: `${mockServerUrl}/slow`,
        signingSecret: 'whsec_timeout1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        maxRetries: 3,
        enabled: true
      }
    });

    const event = await prisma.event.create({
      data: {
        id: 'evt_worker_timeout',
        endpointId: endpoint.id,
        eventType: 'slow.test',
        payload: JSON.stringify({}),
        status: 'DELIVERING',
        attempts: 0,
        maxRetries: 3,
        nextAttemptAt: new Date(),
        lockedAt: new Date()
      }
    });

    const result = await deliveryService.deliverEvent(event);

    // Restore timeout
    config.worker.deliveryTimeoutMs = originalTimeout;

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.errorMessage).toContain('timed out');

    const updated = await prisma.event.findUnique({
      where: { id: event.id },
      include: { deliveryAttempts: true }
    });
    expect(updated.status).toBe('RETRYING');
    expect(updated.deliveryAttempts[0].errorMessage).toContain('timed out');
  });
});
