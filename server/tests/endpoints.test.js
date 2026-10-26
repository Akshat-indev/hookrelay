import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { getPrismaClient } from '../src/db/prisma.js';

describe('Endpoints API', () => {
  it('creates an endpoint and returns the signing secret once', async () => {
    const res = await request(app)
      .post('/api/endpoints')
      .send({
        name: 'Stripe Webhook',
        destinationUrl: 'http://localhost:3000/api/webhooks',
        maxRetries: 5
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.id).toMatch(/^ep_/);
    expect(res.body.name).toBe('Stripe Webhook');
    expect(res.body.destinationUrl).toBe('http://localhost:3000/api/webhooks');
    expect(res.body.maxRetries).toBe(5);
    expect(res.body.enabled).toBe(true);
    expect(res.body).toHaveProperty('signingSecret');
    expect(res.body.signingSecret).toMatch(/^whsec_/);
    expect(res.body).toHaveProperty('warning');
  });

  it('rejects creation when required fields are missing or invalid', async () => {
    // Missing name
    const res1 = await request(app)
      .post('/api/endpoints')
      .send({
        destinationUrl: 'http://localhost:3000/api/webhooks'
      });
    expect(res1.status).toBe(400);

    // Invalid URL
    const res2 = await request(app)
      .post('/api/endpoints')
      .send({
        name: 'Test',
        destinationUrl: 'not-a-url'
      });
    expect(res2.status).toBe(400);

    // Negative maxRetries
    const res3 = await request(app)
      .post('/api/endpoints')
      .send({
        name: 'Test',
        destinationUrl: 'http://localhost:3000/api/webhooks',
        maxRetries: -1
      });
    expect(res3.status).toBe(400);
  });

  it('lists endpoints without exposing signing secrets', async () => {
    // Create an endpoint
    await request(app)
      .post('/api/endpoints')
      .send({
        name: 'Shopify Webhook',
        destinationUrl: 'http://localhost:3000/shopify'
      });

    const res = await request(app).get('/api/endpoints');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    // Verify signingSecret is NOT in list response
    const endpoint = res.body[0];
    expect(endpoint).not.toHaveProperty('signingSecret');
    expect(endpoint).toHaveProperty('id');
    expect(endpoint).toHaveProperty('name');
    expect(endpoint).toHaveProperty('_count');
  });

  it('retrieves single endpoint details without exposing signing secret', async () => {
    const created = await request(app)
      .post('/api/endpoints')
      .send({
        name: 'Auth0 Webhook',
        destinationUrl: 'http://localhost:3000/auth0'
      });

    const res = await request(app).get(`/api/endpoints/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body.name).toBe('Auth0 Webhook');
    expect(res.body).not.toHaveProperty('signingSecret');
  });

  it('returns 404 for nonexistent endpoint ID', async () => {
    const res = await request(app).get('/api/endpoints/ep_nonexistent123');
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
  });

  it('updates endpoint settings safely', async () => {
    const created = await request(app)
      .post('/api/endpoints')
      .send({
        name: 'Original Name',
        destinationUrl: 'http://localhost:3000/old'
      });

    const res = await request(app)
      .patch(`/api/endpoints/${created.body.id}`)
      .send({
        name: 'Updated Name',
        enabled: false,
        maxRetries: 8
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Name');
    expect(res.body.enabled).toBe(false);
    expect(res.body.maxRetries).toBe(8);
    expect(res.body).not.toHaveProperty('signingSecret');
  });

  it('disables endpoint instead of deleting if historical events exist', async () => {
    const prisma = getPrismaClient();
    const created = await request(app)
      .post('/api/endpoints')
      .send({
        name: 'Webhook With Events',
        destinationUrl: 'http://localhost:3000/webhook'
      });

    // Ingest an event
    await request(app)
      .post(`/api/endpoints/${created.body.id}/events`)
      .send({
        event_type: 'test.event',
        data: { test: true }
      });

    // Delete endpoint
    const delRes = await request(app).delete(`/api/endpoints/${created.body.id}`);

    expect(delRes.status).toBe(200);
    expect(delRes.body.action).toBe('disabled');
    expect(delRes.body.endpoint.enabled).toBe(false);

    // Check DB still has endpoint and event preserved
    const checkEp = await prisma.endpoint.findUnique({ where: { id: created.body.id } });
    expect(checkEp).not.toBeNull();
    expect(checkEp.enabled).toBe(false);

    const checkEvt = await prisma.event.findFirst({ where: { endpointId: created.body.id } });
    expect(checkEvt).not.toBeNull();
  });
});
