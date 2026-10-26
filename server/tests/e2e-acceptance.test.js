import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import request from 'supertest';
import { app } from '../src/app.js';
import { getPrismaClient } from '../src/db/prisma.js';
import { deliveryService } from '../src/services/deliveryService.js';
import { queueService } from '../src/services/queueService.js';
import { verifySignature } from '../src/lib/crypto.js';

describe('Demo & Acceptance Criteria Verification (End-to-End)', () => {
  let mockServer;
  let mockServerUrl;
  let serverHandler = () => {};

  beforeAll(async () => {
    mockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
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
      await new Promise((r) => mockServer.close(r));
    }
  });

  // Scenario 1: Successful delivery
  it('Scenario 1: Successful delivery end-to-end', async () => {
    let receivedPayload = null;
    let receivedSignature = null;

    serverHandler = (req, res, body) => {
      receivedPayload = JSON.parse(body);
      receivedSignature = req.headers['x-hookrelay-signature'];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, receivedAt: new Date().toISOString() }));
    };

    // 1. Register test webhook destination
    const epRes = await request(app)
      .post('/api/endpoints')
      .send({
        name: 'Scenario 1 Destination',
        destinationUrl: `${mockServerUrl}/scenario1`,
        maxRetries: 3
      });

    expect(epRes.status).toBe(201);
    const endpointId = epRes.body.id;
    const signingSecret = epRes.body.signingSecret;

    // 2. Submit an event
    const eventData = { orderId: 'ord_999', amount: 15000 };
    const evtRes = await request(app)
      .post(`/api/endpoints/${endpointId}/events`)
      .send({
        event_type: 'order.completed',
        data: eventData
      });

    // 3. Receive HTTP 202 with event ID
    expect(evtRes.status).toBe(202);
    expect(evtRes.body).toHaveProperty('event_id');
    const eventId = evtRes.body.event_id;

    // 4. Claim and process via delivery engine
    const claimed = await queueService.claimDueJobs('worker_s1', 1);
    expect(claimed.length).toBe(1);
    expect(claimed[0].id).toBe(eventId);

    const deliveryResult = await deliveryService.deliverEvent(claimed[0]);
    expect(deliveryResult.success).toBe(true);

    // 5. Verify destination received real JSON payload with envelope
    expect(receivedPayload).not.toBeNull();
    expect(receivedPayload.event_id).toBe(eventId);
    expect(receivedPayload.event_type).toBe('order.completed');
    expect(receivedPayload.data).toEqual(eventData);

    // 6. Verify HMAC signature was valid
    expect(verifySignature(JSON.stringify(receivedPayload), receivedSignature, signingSecret)).toBe(true);

    // 7. Verify dashboard/API shows DELIVERED with latency and response code
    const getEvtRes = await request(app).get(`/api/events/${eventId}`);
    expect(getEvtRes.status).toBe(200);
    expect(getEvtRes.body.status).toBe('DELIVERED');
    expect(getEvtRes.body.attempts).toBe(1);
    expect(getEvtRes.body.deliveryAttempts.length).toBe(1);
    expect(getEvtRes.body.deliveryAttempts[0].statusCode).toBe(200);
    expect(getEvtRes.body.deliveryAttempts[0].latencyMs).toBeGreaterThanOrEqual(0);
    expect(getEvtRes.body.deliveryAttempts[0].responseBody).toContain('ok');
  });

  // Scenario 2: Automatic retry
  it('Scenario 2: Automatic retry on 500 failure transitioning to RETRYING and succeeding on retry', async () => {
    let attemptCount = 0;

    serverHandler = (req, res) => {
      attemptCount++;
      if (attemptCount === 1) {
        // First attempt fails with HTTP 500
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Temporary database lock' }));
      } else {
        // Second attempt succeeds with HTTP 200
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      }
    };

    const epRes = await request(app)
      .post('/api/endpoints')
      .send({
        name: 'Flaky Destination',
        destinationUrl: `${mockServerUrl}/flaky`,
        maxRetries: 3
      });
    const endpointId = epRes.body.id;

    // Submit event
    const evtRes = await request(app)
      .post(`/api/endpoints/${endpointId}/events`)
      .send({
        event_type: 'invoice.generated',
        data: { invoiceId: 'inv_4040' }
      });
    const eventId = evtRes.body.event_id;

    // Attempt 1: Process initial delivery
    const claimed1 = await queueService.claimDueJobs('worker_s2', 1);
    expect(claimed1.length).toBe(1);
    const result1 = await deliveryService.deliverEvent(claimed1[0]);

    expect(result1.success).toBe(false);
    expect(result1.retryable).toBe(true);

    // Verify event enters RETRYING with nextAttemptAt in the future
    const afterAttempt1 = await request(app).get(`/api/events/${eventId}`);
    expect(afterAttempt1.body.status).toBe('RETRYING');
    expect(afterAttempt1.body.attempts).toBe(1);
    expect(new Date(afterAttempt1.body.nextAttemptAt).getTime()).toBeGreaterThan(Date.now());
    expect(afterAttempt1.body.deliveryAttempts.length).toBe(1);
    expect(afterAttempt1.body.deliveryAttempts[0].statusCode).toBe(500);

    // Fast-forward nextAttemptAt to now so it is due for retry
    const prisma = getPrismaClient();
    await prisma.event.update({
      where: { id: eventId },
      data: { nextAttemptAt: new Date(Date.now() - 1000) }
    });

    // Attempt 2: Worker claims and executes retry
    const claimed2 = await queueService.claimDueJobs('worker_s2', 1);
    expect(claimed2.length).toBe(1);
    const result2 = await deliveryService.deliverEvent(claimed2[0]);

    expect(result2.success).toBe(true);

    // Verify all attempts remain visible in history and status is DELIVERED
    const finalEvent = await request(app).get(`/api/events/${eventId}`);
    expect(finalEvent.body.status).toBe('DELIVERED');
    expect(finalEvent.body.attempts).toBe(2);
    expect(finalEvent.body.deliveryAttempts.length).toBe(2);
    expect(finalEvent.body.deliveryAttempts[0].attemptNumber).toBe(1);
    expect(finalEvent.body.deliveryAttempts[0].statusCode).toBe(500);
    expect(finalEvent.body.deliveryAttempts[1].attemptNumber).toBe(2);
    expect(finalEvent.body.deliveryAttempts[1].statusCode).toBe(200);
  });

  // Scenario 3: Permanent failure
  it('Scenario 3: Non-retryable HTTP 400 immediately marks event as FAILED without retries', async () => {
    serverHandler = (req, res) => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid customer account format' }));
    };

    const epRes = await request(app)
      .post('/api/endpoints')
      .send({
        name: 'Strict Destination',
        destinationUrl: `${mockServerUrl}/bad-request`,
        maxRetries: 5
      });
    const endpointId = epRes.body.id;

    const evtRes = await request(app)
      .post(`/api/endpoints/${endpointId}/events`)
      .send({
        event_type: 'customer.bad',
        data: {}
      });
    const eventId = evtRes.body.event_id;

    const claimed = await queueService.claimDueJobs('worker_s3', 1);
    const result = await deliveryService.deliverEvent(claimed[0]);

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(false);

    // Verify status is FAILED immediately
    const checkEvt = await request(app).get(`/api/events/${eventId}`);
    expect(checkEvt.body.status).toBe('FAILED');
    expect(checkEvt.body.attempts).toBe(1);
    expect(checkEvt.body.deliveryAttempts[0].statusCode).toBe(400);

    // Verify no jobs are due
    const nextClaims = await queueService.claimDueJobs('worker_s3', 10);
    expect(nextClaims.find((j) => j.id === eventId)).toBeUndefined();
  });

  // Scenario 4: Manual replay
  it('Scenario 4: Manual replay preserves attempt history and re-delivers successfully', async () => {
    let mode = 'fail';

    serverHandler = (req, res) => {
      if (mode === 'fail') {
        res.writeHead(500);
        res.end('Server down');
      } else {
        res.writeHead(200);
        res.end('Recovered successfully');
      }
    };

    const epRes = await request(app)
      .post('/api/endpoints')
      .send({
        name: 'Replay Target',
        destinationUrl: `${mockServerUrl}/replay`,
        maxRetries: 1
      });
    const endpointId = epRes.body.id;

    const evtRes = await request(app)
      .post(`/api/endpoints/${endpointId}/events`)
      .send({
        event_type: 'replay.test',
        data: { item: 'widget_A' }
      });
    const eventId = evtRes.body.event_id;

    // First attempt fails and exhausts maxRetries (1) -> FAILED
    const claim1 = await queueService.claimDueJobs('worker_s4', 1);
    await deliveryService.deliverEvent(claim1[0]);

    const failedEvt = await request(app).get(`/api/events/${eventId}`);
    expect(failedEvt.body.status).toBe('FAILED');
    expect(failedEvt.body.deliveryAttempts.length).toBe(1);

    // Fix the destination
    mode = 'recover';

    // Trigger manual replay via API
    const replayRes = await request(app).post(`/api/events/${eventId}/replay`);
    expect(replayRes.status).toBe(200);
    expect(replayRes.body.event.status).toBe('QUEUED');

    // Worker claims replay job
    const claimReplay = await queueService.claimDueJobs('worker_s4', 1);
    expect(claimReplay.length).toBe(1);
    expect(claimReplay[0].id).toBe(eventId);

    const deliverReplay = await deliveryService.deliverEvent(claimReplay[0]);
    expect(deliverReplay.success).toBe(true);

    // Verify attempts history contains prior attempt (500) AND new attempt (200)
    const replayedEvt = await request(app).get(`/api/events/${eventId}`);
    expect(replayedEvt.body.status).toBe('DELIVERED');
    expect(replayedEvt.body.attempts).toBe(2);
    expect(replayedEvt.body.deliveryAttempts.length).toBe(2);
    expect(replayedEvt.body.deliveryAttempts[0].statusCode).toBe(500);
    expect(replayedEvt.body.deliveryAttempts[1].statusCode).toBe(200);
  });

  // Scenario 5: Persistence & Stale recovery
  it('Scenario 5: Persisted jobs survive restarts and abandoned locks are safely recovered', async () => {
    const prisma = getPrismaClient();

    const epRes = await request(app)
      .post('/api/endpoints')
      .send({
        name: 'Persistence Target',
        destinationUrl: `${mockServerUrl}/persist`,
        maxRetries: 3
      });
    const endpointId = epRes.body.id;

    // Create queued event
    const evtRes = await request(app)
      .post(`/api/endpoints/${endpointId}/events`)
      .send({ event_type: 'persist.check', data: { persistent: true } });
    const eventId = evtRes.body.event_id;

    // Simulate worker claiming the job and then abruptly crashing (leaving status DELIVERING, lockedAt 2 minutes ago)
    await prisma.event.update({
      where: { id: eventId },
      data: {
        status: 'DELIVERING',
        lockedAt: new Date(Date.now() - 120000), // 2 min ago
        lockedBy: 'worker_crashed_99'
      }
    });

    // New worker starts and runs stale-job recovery
    const recovered = await queueService.recoverStaleJobs(60000);
    expect(recovered).toBeGreaterThanOrEqual(1);

    // Verify event is now recovered and ready to be claimed
    const recoveredEvt = await prisma.event.findUnique({ where: { id: eventId } });
    expect(recoveredEvt.status).toBe('QUEUED');
    expect(recoveredEvt.lockedAt).toBeNull();

    // Verify it can be claimed and processed by the new worker
    const claimNew = await queueService.claimDueJobs('worker_new_1', 1);
    expect(claimNew.find((j) => j.id === eventId)).toBeDefined();
  });
});
