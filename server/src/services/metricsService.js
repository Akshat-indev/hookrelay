import { getPrismaClient } from '../db/prisma.js';

export class MetricsService {
  constructor(prisma = getPrismaClient()) {
    this.prisma = prisma;
  }

  async getOverviewMetrics() {
    const [
      totalEvents,
      deliveredEvents,
      failedEvents,
      queuedEvents,
      retryingEvents,
      deliveringEvents,
      totalEndpoints,
      activeEndpoints,
      recentAttempts
    ] = await Promise.all([
      this.prisma.event.count(),
      this.prisma.event.count({ where: { status: 'DELIVERED' } }),
      this.prisma.event.count({ where: { status: 'FAILED' } }),
      this.prisma.event.count({ where: { status: 'QUEUED' } }),
      this.prisma.event.count({ where: { status: 'RETRYING' } }),
      this.prisma.event.count({ where: { status: 'DELIVERING' } }),
      this.prisma.endpoint.count(),
      this.prisma.endpoint.count({ where: { enabled: true } }),
      this.prisma.deliveryAttempt.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          event: {
            select: {
              id: true,
              eventType: true,
              endpoint: {
                select: {
                  id: true,
                  name: true,
                  destinationUrl: true
                }
              }
            }
          }
        }
      })
    ]);

    const pendingEvents = queuedEvents + retryingEvents + deliveringEvents;
    const completedEvents = deliveredEvents + failedEvents;
    const successRate = completedEvents > 0
      ? Math.round((deliveredEvents / completedEvents) * 1000) / 10
      : (totalEvents > 0 ? 0 : 100);

    return {
      totalEvents,
      deliveredEvents,
      failedEvents,
      pendingEvents,
      queuedEvents,
      retryingEvents,
      deliveringEvents,
      totalEndpoints,
      activeEndpoints,
      successRate,
      recentAttempts: recentAttempts.map((att) => ({
        id: att.id,
        eventId: att.eventId,
        eventType: att.event?.eventType,
        endpointName: att.event?.endpoint?.name,
        destinationUrl: att.event?.endpoint?.destinationUrl,
        attemptNumber: att.attemptNumber,
        statusCode: att.statusCode,
        errorMessage: att.errorMessage,
        latencyMs: att.latencyMs,
        createdAt: att.createdAt
      }))
    };
  }
}

export const metricsService = new MetricsService();
