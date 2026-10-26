import { app } from './app.js';
import { config } from './config/index.js';
import { logger } from './lib/logger.js';
import { getPrismaClient } from './db/prisma.js';

const server = app.listen(config.port, () => {
  logger.info(`HookRelay API server running on http://localhost:${config.port} (env: ${config.nodeEnv})`);
});

// Graceful shutdown handling
async function shutdown(signal) {
  logger.info(`Received ${signal}. Shutting down API server gracefully...`);
  server.close(async () => {
    logger.info('HTTP server closed.');
    try {
      const prisma = getPrismaClient();
      await prisma.$disconnect();
      logger.info('Database disconnected.');
      process.exit(0);
    } catch (err) {
      logger.error('Error during database disconnection:', { error: err.message });
      process.exit(1);
    }
  });

  // Force close after 10 seconds if not closed
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
