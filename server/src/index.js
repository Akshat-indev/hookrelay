import { app } from './app.js';
import { config } from './config/index.js';
import { logger } from './lib/logger.js';
import { getPrismaClient } from './db/prisma.js';
import { startWorker, shutdownWorker } from './worker.js';

logger.info(`Starting HookRelay Unified Process (API + Delivery Worker)...`);

// 1. Start HTTP API Server
const server = app.listen(config.port, () => {
  logger.info(`HookRelay API server running on port ${config.port} (env: ${config.nodeEnv})`);
});

// 2. Start Delivery Worker Loop in background
startWorker().catch((err) => {
  logger.error(`Fatal error in delivery worker: ${err.message}`);
});

// Graceful shutdown
async function shutdown(signal) {
  logger.info(`Received ${signal}. Shutting down API and worker gracefully...`);

  // Stop accepting new HTTP requests
  server.close(() => {
    logger.info('HTTP server closed.');
  });

  // Stop background worker
  await shutdownWorker(signal);

  try {
    const prisma = getPrismaClient();
    await prisma.$disconnect();
    logger.info('Database disconnected.');
  } catch (err) {
    logger.error('Error disconnecting database:', { error: err.message });
  }

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
