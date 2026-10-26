import { describe, it, expect } from 'vitest';
import { getPrismaClient } from '../src/db/prisma.js';
import { queueService } from '../src/services/queueService.js';

describe('Queue Service & Job Lifecycle', () => {
  it('prevents concurrent workers from claiming the same due job', async () => {
    const prisma = getPrismaClient();

    const endpoint = await prisma.endpoint.create({
      data: {
        id: 'ep_concurrent_claim',
        name: 'Concurrent Endpoint',
        destinationUrl: 'http://localhost:3000/webhook',
        signingSecret: 'whsec_concurrent1234567890abcdef1234567890abcdef1234567890abcdef123456',
        maxRetries: 3,
        enabled: true
      }
    });

    // Create 5 queued jobs
    for (let i = 1; i <= 5; i++) {
      await prisma.event.create({
        data: {
          id: `evt_concurrent_${i}`,
          endpointId: endpoint.id,
          eventType: 'job.test',
          payload: JSON.stringify({ index: i }),
          status: 'QUEUED',
          attempts: 0,
          maxRetries: 3,
          nextAttemptAt: new Date(Date.now() - 1000) // due now
        }
      });
    }

    // Simulate two concurrent workers claiming jobs at the exact same moment
    const [worker1Claims, worker2Claims] = await Promise.all([
      queueService.claimDueJobs('worker_alpha', 5),
      queueService.claimDueJobs('worker_beta', 5)
    ]);

    const claimedIdsAlpha = worker1Claims.map((j) => j.id);
    const claimedIdsBeta = worker2Claims.map((j) => j.id);

    // Verify no job was claimed by both workers!
    const overlap = claimedIdsAlpha.filter((id) => claimedIdsBeta.includes(id));
    expect(overlap).toEqual([]);

    // Total claimed should be exactly 5
    expect(claimedIdsAlpha.length + claimedIdsBeta.length).toBe(5);

    // Verify all 5 are in DELIVERING state with lockedBy set
    const allEvents = await prisma.event.findMany({
      where: { endpointId: endpoint.id }
    });
    for (const evt of allEvents) {
      expect(evt.status).toBe('DELIVERING');
      expect(['worker_alpha', 'worker_beta']).toContain(evt.lockedBy);
      expect(evt.lockedAt).not.toBeNull();
    }
  });

  it('recovers stale jobs stuck in DELIVERING past lease timeout', async () => {
    const prisma = getPrismaClient();

    const endpoint = await prisma.endpoint.create({
      data: {
        id: 'ep_stale_test',
        name: 'Stale Endpoint',
        destinationUrl: 'http://localhost:3000/webhook',
        signingSecret: 'whsec_stale1234567890abcdef1234567890abcdef1234567890abcdef123456789012',
        maxRetries: 3,
        enabled: true
      }
    });

    // Create a job that got stuck 2 minutes ago (worker died)
    const stuckEvent = await prisma.event.create({
      data: {
        id: 'evt_stuck_job',
        endpointId: endpoint.id,
        eventType: 'stale.event',
        payload: JSON.stringify({}),
        status: 'DELIVERING',
        attempts: 1, // already had 1 attempt
        maxRetries: 3,
        nextAttemptAt: new Date(Date.now() - 120000),
        lockedAt: new Date(Date.now() - 120000), // 2 minutes ago
        lockedBy: 'worker_crashed'
      }
    });

    // Run recovery with 60s lease timeout
    const recoveredCount = await queueService.recoverStaleJobs(60000);
    expect(recoveredCount).toBeGreaterThanOrEqual(1);

    // Verify job was released back to RETRYING and lock cleared
    const recovered = await prisma.event.findUnique({
      where: { id: stuckEvent.id }
    });
    expect(recovered.status).toBe('RETRYING');
    expect(recovered.lockedAt).toBeNull();
    expect(recovered.lockedBy).toBeNull();
  });
});
