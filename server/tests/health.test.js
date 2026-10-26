import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { getPrismaClient } from '../src/db/prisma.js';

describe('Health API', () => {
  it('returns healthy status for API and database', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.api).toBe('healthy');
    expect(res.body.database).toBe('healthy');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('reports worker as offline when no recent heartbeat exists', async () => {
    const res = await request(app).get('/api/health');

    expect(res.body.worker.status).toBe('offline');
  });

  it('reports worker as healthy when an active heartbeat exists within 15 seconds', async () => {
    const prisma = getPrismaClient();
    await prisma.workerHeartbeat.upsert({
      where: { id: 'primary' },
      update: { lastHeartbeat: new Date(), status: 'RUNNING' },
      create: { id: 'primary', workerId: 'worker_test', lastHeartbeat: new Date(), status: 'RUNNING' }
    });

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.worker.status).toBe('healthy');
    expect(res.body.worker.lastHeartbeat).not.toBeNull();
  });
});
