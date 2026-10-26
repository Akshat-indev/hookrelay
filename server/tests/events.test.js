import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { getPrismaClient } from '../src/db/prisma.js';

describe('Events API', () => {
  it('accepts valid event payload, persists it, and returns 202 Accepted', async () => {
    const prisma = getPrismaClient();

    // 1. Create an endpoint
    const epRes = await request(app)
      .post('/api/endpoints')
      .send({
        name: 'Payment Service',
        destinationUrl: 'http://localhost:3000/payments'
      });
    const endpointId = epRes.body.id;

    // 2. Ingest event
    const payload = {
      event_type: 'payment.completed',
      data: {
        payment_id: 'pay_123',
        amount: 499
      }
    };

    const res = await request(app)
      .post(`/api/endpoints/${endpointId}/events`)
      .send(payload);

    expect(res.status).toBe(202);
    expect(res.body).toHaveProperty('event_id');
    expect(res.body.event_id).toMatch(/^evt_/);
    expect(res.body.status).toBe('QUEUED');

    // 3. Verify it was actually persisted in SQLite database
    const dbEvent = await prisma.event.findUnique({
      where: { id: res.body.event_id }
    });
    expect(dbEvent).not.toBeNull();
    expect(dbEvent.endpointId).toBe(endpointId);
    expect(dbEvent.eventType).toBe('payment.completed');
    expect(JSON.parse(dbEvent.payload)).toEqual(payload.data);
    expect(dbEvent.status).toBe('QUEUED');
    expect(dbEvent.attempts).toBe(0);
  });

  it('rejects event ingestion for nonexistent endpoint with 404', async () => {
    const res = await request(app)
      .post('/api/endpoints/ep_missing/events')
      .send({
        event_type: 'test',
        data: {}
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
  });

  it('rejects event ingestion for disabled endpoint with 400', async () => {
    const epRes = await request(app)
      .post('/api/endpoints')
      .send({
        name: 'Disabled Service',
        destinationUrl: 'http://localhost:3000/webhook'
      });
    const endpointId = epRes.body.id;

    // Disable endpoint
    await request(app)
      .patch(`/api/endpoints/${endpointId}`)
      .send({ enabled: false });

    const res = await request(app)
      .post(`/api/endpoints/${endpointId}/events`)
      .send({
        event_type: 'test',
        data: {}
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('disabled');
  });

  it('supports Idempotency-Key header correctly', async () => {
    const epRes = await request(app)
      .post('/api/endpoints')
      .send({
        name: 'Idempotent Service',
        destinationUrl: 'http://localhost:3000/webhooks'
      });
    const endpointId = epRes.body.id;

    const payload = {
      event_type: 'order.created',
      data: { order_id: 101 }
    };

    // First request
    const res1 = await request(app)
      .post(`/api/endpoints/${endpointId}/events`)
      .set('Idempotency-Key', 'idem_key_101')
      .send(payload);

    expect(res1.status).toBe(202);
    const eventId = res1.body.event_id;

    // Duplicate request with same idempotency key and same payload
    const res2 = await request(app)
      .post(`/api/endpoints/${endpointId}/events`)
      .set('Idempotency-Key', 'idem_key_101')
      .send(payload);

    expect(res2.status).toBe(200);
    expect(res2.body.event_id).toBe(eventId);
    expect(res2.body.idempotent_replayed).toBe(true);

    // Reused idempotency key with DIFFERENT payload -> 409 Conflict
    const res3 = await request(app)
      .post(`/api/endpoints/${endpointId}/events`)
      .set('Idempotency-Key', 'idem_key_101')
      .send({
        event_type: 'order.created',
        data: { order_id: 999 } // different!
      });

    expect(res3.status).toBe(409);
    expect(res3.body.error).toContain('Idempotency-Key reused with different payload');
  });

  it('lists events with pagination and filters', async () => {
    const epRes = await request(app)
      .post('/api/endpoints')
      .send({
        name: 'List Testing',
        destinationUrl: 'http://localhost:3000/webhooks'
      });
    const endpointId = epRes.body.id;

    // Ingest 3 events
    await request(app).post(`/api/endpoints/${endpointId}/events`).send({ event_type: 'user.signup', data: { u: 1 } });
    await request(app).post(`/api/endpoints/${endpointId}/events`).send({ event_type: 'user.login', data: { u: 1 } });
    await request(app).post(`/api/endpoints/${endpointId}/events`).send({ event_type: 'invoice.paid', data: { i: 5 } });

    // List all
    const resAll = await request(app).get('/api/events');
    expect(resAll.status).toBe(200);
    expect(resAll.body.events.length).toBe(3);
    expect(resAll.body.pagination.total).toBe(3);

    // Filter by event type
    const resFilter = await request(app).get('/api/events?eventType=user.');
    expect(resFilter.body.events.length).toBe(2);

    // Filter by endpoint
    const resEp = await request(app).get(`/api/events?endpointId=${endpointId}`);
    expect(resEp.body.events.length).toBe(3);

    // Pagination
    const resPage = await request(app).get('/api/events?limit=2&page=1');
    expect(resPage.body.events.length).toBe(2);
    expect(resPage.body.pagination.totalPages).toBe(2);
  });

  it('retrieves event details with chronological delivery attempts', async () => {
    const prisma = getPrismaClient();
    const epRes = await request(app)
      .post('/api/endpoints')
      .send({ name: 'Detail Test', destinationUrl: 'http://localhost:3000/hook' });
    const endpointId = epRes.body.id;

    const ingRes = await request(app)
      .post(`/api/endpoints/${endpointId}/events`)
      .send({ event_type: 'test.detail', data: { foo: 'bar' } });
    const eventId = ingRes.body.event_id;

    // Simulate two recorded delivery attempts in DB
    await prisma.deliveryAttempt.create({
      data: {
        id: 'att_1',
        eventId,
        attemptNumber: 1,
        statusCode: 500,
        errorMessage: 'HTTP 500 Internal Server Error',
        latencyMs: 120,
        startedAt: new Date(Date.now() - 5000),
        completedAt: new Date(Date.now() - 4880)
      }
    });
    await prisma.deliveryAttempt.create({
      data: {
        id: 'att_2',
        eventId,
        attemptNumber: 2,
        statusCode: 200,
        responseBody: '{"ok":true}',
        latencyMs: 45,
        startedAt: new Date(Date.now() - 1000),
        completedAt: new Date(Date.now() - 955)
      }
    });

    const res = await request(app).get(`/api/events/${eventId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(eventId);
    expect(res.body.payload).toEqual({ foo: 'bar' });
    expect(res.body.deliveryAttempts.length).toBe(2);
    expect(res.body.deliveryAttempts[0].attemptNumber).toBe(1);
    expect(res.body.deliveryAttempts[0].statusCode).toBe(500);
    expect(res.body.deliveryAttempts[1].attemptNumber).toBe(2);
    expect(res.body.deliveryAttempts[1].statusCode).toBe(200);
  });

  it('manually replays event and preserves previous attempt history', async () => {
    const prisma = getPrismaClient();
    const epRes = await request(app)
      .post('/api/endpoints')
      .send({ name: 'Replay Test', destinationUrl: 'http://localhost:3000/hook', maxRetries: 3 });
    const endpointId = epRes.body.id;

    const ingRes = await request(app)
      .post(`/api/endpoints/${endpointId}/events`)
      .send({ event_type: 'test.replay', data: { val: 42 } });
    const eventId = ingRes.body.event_id;

    // Mark event as failed after 3 attempts
    await prisma.event.update({
      where: { id: eventId },
      data: { status: 'FAILED', attempts: 3 }
    });
    await prisma.deliveryAttempt.create({
      data: {
        id: 'att_old_1',
        eventId,
        attemptNumber: 1,
        statusCode: 502,
        errorMessage: 'Bad Gateway',
        latencyMs: 50,
        startedAt: new Date(),
        completedAt: new Date()
      }
    });

    // Trigger replay
    const replayRes = await request(app).post(`/api/events/${eventId}/replay`);
    expect(replayRes.status).toBe(200);
    expect(replayRes.body.event.status).toBe('QUEUED');
    expect(replayRes.body.event.attempts).toBe(3); // prior attempts preserved!

    // Verify DB
    const updated = await prisma.event.findUnique({
      where: { id: eventId },
      include: { deliveryAttempts: true }
    });
    expect(updated.status).toBe('QUEUED');
    expect(updated.attempts).toBe(3);
    expect(updated.deliveryAttempts.length).toBe(1); // attempt history preserved!
  });

  it('prevents replay when event is currently DELIVERING', async () => {
    const prisma = getPrismaClient();
    const epRes = await request(app)
      .post('/api/endpoints')
      .send({ name: 'Delivering Test', destinationUrl: 'http://localhost:3000/hook' });

    const ingRes = await request(app)
      .post(`/api/endpoints/${epRes.body.id}/events`)
      .send({ event_type: 'delivering.test', data: {} });
    const eventId = ingRes.body.event_id;

    // Set to DELIVERING
    await prisma.event.update({
      where: { id: eventId },
      data: { status: 'DELIVERING', lockedAt: new Date() }
    });

    const res = await request(app).post(`/api/events/${eventId}/replay`);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('currently being delivered');
  });
});
