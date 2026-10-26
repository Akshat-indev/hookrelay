import { getPrismaClient } from '../db/prisma.js';
import { logger } from '../lib/logger.js';
import { config } from '../config/index.js';

export class QueueService {
  constructor(prisma = getPrismaClient()) {
    this.prisma = prisma;
  }

  /**
   * Recover stale jobs that have been stuck in DELIVERING state longer than leaseTimeoutMs.
   * This handles cases where a worker crashed or was killed mid-delivery.
   */
  async recoverStaleJobs(workerLeaseTimeoutMs = config.worker.leaseTimeoutMs) {
    const staleThreshold = new Date(Date.now() - workerLeaseTimeoutMs);

    // Find stale jobs
    const staleEvents = await this.prisma.event.findMany({
      where: {
        status: 'DELIVERING',
        lockedAt: { lt: staleThreshold }
      },
      select: { id: true, attempts: true, lockedAt: true }
    });

    if (staleEvents.length === 0) {
      return 0;
    }

    logger.warn(`Found ${staleEvents.length} stale delivering jobs. Recovering...`);

    let recoveredCount = 0;
    for (const evt of staleEvents) {
      // Transition back to RETRYING if it already had attempts, or QUEUED if 0 attempts
      const newStatus = evt.attempts > 0 ? 'RETRYING' : 'QUEUED';
      const updated = await this.prisma.event.updateMany({
        where: {
          id: evt.id,
          status: 'DELIVERING',
          lockedAt: evt.lockedAt
        },
        data: {
          status: newStatus,
          lockedAt: null,
          lockedBy: null,
          nextAttemptAt: new Date() // eligible immediately
        }
      });
      recoveredCount += updated.count;
    }

    if (recoveredCount > 0) {
      logger.info(`Successfully recovered ${recoveredCount} stale jobs.`);
    }

    return recoveredCount;
  }

  /**
   * Atomically fetch and claim a batch of due jobs for a specific worker instance.
   * Concurrency-safe: uses conditional state updates so two workers cannot claim the same job.
   */
  async claimDueJobs(workerId, batchSize = config.worker.batchSize) {
    const now = new Date();

    // 1. Find candidates due for processing
    const candidates = await this.prisma.event.findMany({
      where: {
        status: { in: ['QUEUED', 'RETRYING'] },
        nextAttemptAt: { lte: now }
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: batchSize * 2, // Take a small buffer in case another worker claims some
      select: { id: true }
    });

    if (candidates.length === 0) {
      return [];
    }

    const claimedJobs = [];

    // 2. Atomically claim each candidate
    for (const candidate of candidates) {
      if (claimedJobs.length >= batchSize) break;

      const claimTime = new Date();
      // Conditional update ensures only one worker changes status from QUEUED/RETRYING to DELIVERING
      const result = await this.prisma.event.updateMany({
        where: {
          id: candidate.id,
          status: { in: ['QUEUED', 'RETRYING'] }
        },
        data: {
          status: 'DELIVERING',
          lockedAt: claimTime,
          lockedBy: workerId
        }
      });

      // If exactly 1 row was updated, this worker won the claim
      if (result.count === 1) {
        const fullJob = await this.prisma.event.findUnique({
          where: { id: candidate.id },
          include: { endpoint: true }
        });
        if (fullJob) {
          claimedJobs.push(fullJob);
        }
      }
    }

    return claimedJobs;
  }

  /**
   * Calculates exponential backoff delay with jitter.
   * Backoff formula: initialDelay * 2^(attempts - 1) + jitter
   * Respects Retry-After header if provided.
   */
  calculateBackoffMs(attemptNumber, retryAfterHeader = null) {
    // If destination provided a Retry-After header
    if (retryAfterHeader) {
      const parsedSeconds = parseInt(retryAfterHeader, 10);
      if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
        const retryAfterMs = parsedSeconds * 1000;
        return Math.min(Math.max(1000, retryAfterMs), config.worker.maxRetryDelayMs);
      }

      // Check if it's an HTTP-date
      const parsedDate = Date.parse(retryAfterHeader);
      if (!isNaN(parsedDate)) {
        const diffMs = parsedDate - Date.now();
        if (diffMs > 0) {
          return Math.min(diffMs, config.worker.maxRetryDelayMs);
        }
      }
    }

    const initial = config.worker.initialRetryDelayMs;
    const exponent = Math.max(0, attemptNumber - 1);
    const exponential = initial * Math.pow(2, exponent);
    // Add 0-500ms jitter to prevent thundering herd
    const jitter = Math.floor(Math.random() * 500);

    const totalDelay = exponential + jitter;
    return Math.min(totalDelay, config.worker.maxRetryDelayMs);
  }
}

export const queueService = new QueueService();
