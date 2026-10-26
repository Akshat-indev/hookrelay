import { z } from 'zod';
import { getPrismaClient } from '../db/prisma.js';
import { generateId } from '../lib/id.js';
import { AppError } from '../middleware/errorHandler.js';
import { config } from '../config/index.js';

export const ingestEventSchema = z.object({
  event_type: z.string().trim().min(1, 'event_type is required').max(100),
  data: z.any().refine((val) => val !== undefined && val !== null, {
    message: 'data field is required'
  })
});

export const listEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['QUEUED', 'DELIVERING', 'RETRYING', 'DELIVERED', 'FAILED']).optional(),
  endpointId: z.string().optional(),
  eventType: z.string().optional()
});

export class EventService {
  constructor(prisma = getPrismaClient()) {
    this.prisma = prisma;
  }

  async ingestEvent(endpointId, rawBody, idempotencyKey = null) {
    // 1. Verify endpoint exists and is enabled
    const endpoint = await this.prisma.endpoint.findUnique({
      where: { id: endpointId }
    });

    if (!endpoint) {
      throw new AppError(`Endpoint with id "${endpointId}" not found`, 404);
    }

    if (!endpoint.enabled) {
      throw new AppError(`Endpoint "${endpoint.name}" (${endpointId}) is disabled`, 400);
    }

    // 2. Validate payload size
    const payloadStr = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
    if (Buffer.byteLength(payloadStr, 'utf8') > config.security.maxPayloadBytes) {
      throw new AppError(`Payload exceeds maximum allowed size of ${config.security.maxPayloadBytes} bytes`, 413);
    }

    // 3. Parse and validate body structure
    let parsedBody;
    try {
      parsedBody = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    } catch {
      throw new AppError('Malformed JSON payload', 400);
    }

    // Support both event_type/data and eventType/data
    const normalizedInput = {
      event_type: parsedBody.event_type || parsedBody.eventType,
      data: parsedBody.data !== undefined ? parsedBody.data : parsedBody.payload
    };

    const validated = ingestEventSchema.parse(normalizedInput);

    // 4. Handle optional Idempotency-Key
    if (idempotencyKey) {
      const existing = await this.prisma.event.findUnique({
        where: {
          endpointId_idempotencyKey: {
            endpointId,
            idempotencyKey
          }
        }
      });

      if (existing) {
        // Check if the payload is identical
        const existingData = JSON.parse(existing.payload);
        const incomingData = validated.data;
        if (JSON.stringify(existingData) !== JSON.stringify(incomingData)) {
          throw new AppError('Idempotency-Key reused with different payload', 409);
        }
        return {
          event_id: existing.id,
          status: existing.status,
          idempotent_replayed: true
        };
      }
    }

    // 5. Persist the event
    const eventId = generateId('evt');
    const newEvent = await this.prisma.event.create({
      data: {
        id: eventId,
        endpointId: endpoint.id,
        eventType: validated.event_type,
        payload: JSON.stringify(validated.data),
        status: 'QUEUED',
        attempts: 0,
        maxRetries: endpoint.maxRetries,
        nextAttemptAt: new Date(),
        idempotencyKey: idempotencyKey || null
      }
    });

    return {
      event_id: newEvent.id,
      status: newEvent.status
    };
  }

  async listEvents(queryParams) {
    const query = listEventsQuerySchema.parse(queryParams);
    const { page, limit, status, endpointId, eventType } = query;

    const where = {};
    if (status) where.status = status;
    if (endpointId) where.endpointId = endpointId;
    if (eventType) where.eventType = { contains: eventType };

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          endpoint: {
            select: {
              id: true,
              name: true,
              destinationUrl: true,
              enabled: true
            }
          },
          deliveryAttempts: {
            orderBy: { attemptNumber: 'desc' },
            take: 1,
            select: {
              statusCode: true,
              latencyMs: true,
              completedAt: true,
              errorMessage: true
            }
          }
        }
      }),
      this.prisma.event.count({ where })
    ]);

    // Format events for client consumption
    const formattedEvents = events.map((event) => {
      const lastAttempt = event.deliveryAttempts[0] || null;
      return {
        id: event.id,
        endpointId: event.endpointId,
        endpointName: event.endpoint.name,
        destinationUrl: event.endpoint.destinationUrl,
        eventType: event.eventType,
        status: event.status,
        attempts: event.attempts,
        maxRetries: event.maxRetries,
        nextAttemptAt: event.nextAttemptAt,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
        lastStatusCode: lastAttempt?.statusCode ?? null,
        lastLatencyMs: lastAttempt?.latencyMs ?? null,
        lastErrorMessage: lastAttempt?.errorMessage ?? null
      };
    });

    return {
      events: formattedEvents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async getEvent(id) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        endpoint: {
          select: {
            id: true,
            name: true,
            destinationUrl: true,
            enabled: true,
            maxRetries: true
          }
        },
        deliveryAttempts: {
          orderBy: { attemptNumber: 'asc' }
        }
      }
    });

    if (!event) {
      throw new AppError(`Event with id "${id}" not found`, 404);
    }

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(event.payload);
    } catch {
      parsedPayload = event.payload;
    }

    return {
      id: event.id,
      endpointId: event.endpointId,
      endpoint: event.endpoint,
      eventType: event.eventType,
      payload: parsedPayload,
      rawPayload: event.payload,
      status: event.status,
      attempts: event.attempts,
      maxRetries: event.maxRetries,
      nextAttemptAt: event.nextAttemptAt,
      idempotencyKey: event.idempotencyKey,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
      deliveryAttempts: event.deliveryAttempts.map((attempt) => ({
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        statusCode: attempt.statusCode,
        responseBody: attempt.responseBody,
        errorMessage: attempt.errorMessage,
        latencyMs: attempt.latencyMs,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt,
        createdAt: attempt.createdAt
      }))
    };
  }

  async replayEvent(id) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: { endpoint: true }
    });

    if (!event) {
      throw new AppError(`Event with id "${id}" not found`, 404);
    }

    // Prevent concurrent replays if currently in DELIVERING state
    if (event.status === 'DELIVERING') {
      throw new AppError('Event is currently being delivered. Please wait for the current attempt to finish.', 409);
    }

    // Grant a fresh retry quota while keeping the cumulative attempts count
    const additionalRetries = event.endpoint?.maxRetries ?? 5;
    const newMaxRetries = event.attempts + additionalRetries;

    const updated = await this.prisma.event.update({
      where: { id },
      data: {
        status: 'QUEUED',
        nextAttemptAt: new Date(),
        maxRetries: newMaxRetries,
        lockedAt: null,
        lockedBy: null
      },
      include: {
        endpoint: {
          select: {
            id: true,
            name: true,
            destinationUrl: true,
            enabled: true
          }
        },
        deliveryAttempts: {
          orderBy: { attemptNumber: 'asc' }
        }
      }
    });

    return {
      message: 'Event queued for replay',
      event: {
        id: updated.id,
        status: updated.status,
        attempts: updated.attempts,
        maxRetries: updated.maxRetries,
        nextAttemptAt: updated.nextAttemptAt
      }
    };
  }
}

export const eventService = new EventService();
