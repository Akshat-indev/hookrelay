import { Router } from 'express';
import { getPrismaClient } from '../db/prisma.js';

export const healthRouter = Router();

healthRouter.get('/health', async (req, res) => {
  const prisma = getPrismaClient();
  let dbStatus = 'healthy';
  let workerStatus = 'offline';
  let lastWorkerHeartbeat = null;

  try {
    // Check DB
    await prisma.$queryRawUnsafe('SELECT 1;');
  } catch (err) {
    dbStatus = 'unhealthy';
  }

  try {
    // Check Worker Heartbeat
    const heartbeat = await prisma.workerHeartbeat.findUnique({
      where: { id: 'primary' }
    });

    if (heartbeat) {
      lastWorkerHeartbeat = heartbeat.lastHeartbeat;
      const ageMs = Date.now() - new Date(heartbeat.lastHeartbeat).getTime();
      // If heartbeat was within the last 15 seconds, worker is healthy
      if (ageMs < 15000) {
        workerStatus = 'healthy';
      } else if (ageMs < 45000) {
        workerStatus = 'degraded';
      } else {
        workerStatus = 'offline';
      }
    }
  } catch (err) {
    workerStatus = 'unknown';
  }

  const isHealthy = dbStatus === 'healthy';

  return res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    api: 'healthy',
    database: dbStatus,
    worker: {
      status: workerStatus,
      lastHeartbeat: lastWorkerHeartbeat
    },
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});
