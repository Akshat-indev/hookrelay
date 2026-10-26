import { generateId } from './lib/id.js';
import { logger } from './lib/logger.js';
import { config } from './config/index.js';
import { getPrismaClient } from './db/prisma.js';
import { queueService } from './services/queueService.js';
import { deliveryService } from './services/deliveryService.js';

const workerId = generateId('worker');
let isRunning = true;
let inFlightCount = 0;

async function updateHeartbeat(prisma) {
  try {
    await prisma.workerHeartbeat.upsert({
      where: { id: 'primary' },
      update: {
        workerId,
        lastHeartbeat: new Date(),
        status: 'RUNNING'
      },
      create: {
        id: 'primary',
        workerId,
        lastHeartbeat: new Date(),
        status: 'RUNNING'
      }
    });
  } catch (err) {
    logger.warn(`Failed to update worker heartbeat: ${err.message}`);
  }
}

async function runWorker() {
  const prisma = getPrismaClient();
  logger.info(`Starting HookRelay delivery worker [${workerId}]...`);
  logger.info(`Poll interval: ${config.worker.pollIntervalMs}ms, Batch size: ${config.worker.batchSize}`);

  let lastStaleRecovery = 0;
  const STALE_RECOVERY_INTERVAL_MS = 15000; // Check stale jobs every 15s

  while (isRunning) {
    try {
      // 1. Heartbeat
      await updateHeartbeat(prisma);

      // 2. Periodically recover stale jobs from crashed workers
      if (Date.now() - lastStaleRecovery > STALE_RECOVERY_INTERVAL_MS) {
        lastStaleRecovery = Date.now();
        await queueService.recoverStaleJobs(config.worker.leaseTimeoutMs);
      }

      // 3. Atomically claim due jobs
      const claimedJobs = await queueService.claimDueJobs(workerId, config.worker.batchSize);

      if (claimedJobs.length > 0) {
        logger.info(`Claimed ${claimedJobs.length} due job(s) for delivery.`);

        // 4. Process all claimed jobs concurrently
        inFlightCount = claimedJobs.length;
        await Promise.allSettled(
          claimedJobs.map(async (job) => {
            try {
              await deliveryService.deliverEvent(job);
            } catch (err) {
              logger.error(`Unexpected error processing event ${job.id}: ${err.message}`);
            }
          })
        );
        inFlightCount = 0;

        // If there were jobs, immediately loop to check for more without waiting full interval
        continue;
      }
    } catch (loopErr) {
      logger.error(`Error in worker main loop: ${loopErr.message}`);
    }

    // Sleep before next poll
    await new Promise((resolve) => setTimeout(resolve, config.worker.pollIntervalMs));
  }

  logger.info(`Worker [${workerId}] stopped.`);
}

// Graceful shutdown
async function shutdown(signal) {
  if (!isRunning) return;
  logger.info(`Received ${signal}. Shutting down delivery worker gracefully...`);
  isRunning = false;

  const prisma = getPrismaClient();
  try {
    await prisma.workerHeartbeat.update({
      where: { id: 'primary' },
      data: { status: 'STOPPED' }
    }).catch(() => {});
  } catch {}

  // Wait for in-flight deliveries to complete (up to 10s)
  const waitStart = Date.now();
  while (inFlightCount > 0 && Date.now() - waitStart < 10000) {
    logger.info(`Waiting for ${inFlightCount} in-flight delivery jobs to complete...`);
    await new Promise((r) => setTimeout(r, 500));
  }

  try {
    await prisma.$disconnect();
    logger.info('Database connection closed.');
  } catch (err) {
    logger.error(`Error closing database: ${err.message}`);
  }

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start the worker process
runWorker().catch((err) => {
  logger.error(`Fatal error in worker: ${err.message}`);
  process.exit(1);
});
