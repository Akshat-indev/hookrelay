import { getPrismaClient } from '../db/prisma.js';
import { generateId } from '../lib/id.js';
import { generateSignature } from '../lib/crypto.js';
import { validateDestinationUrl } from './ssrfService.js';
import { queueService } from './queueService.js';
import { logger } from '../lib/logger.js';
import { config } from '../config/index.js';

export class DeliveryService {
  constructor(prisma = getPrismaClient()) {
    this.prisma = prisma;
  }

  /**
   * Process delivery for a single claimed event.
   */
  async deliverEvent(event) {
    const attemptNumber = event.attempts + 1;
    const attemptId = generateId('att');
    const startedAt = new Date();

    // 1. Verify endpoint still exists and is enabled
    const endpoint = event.endpoint || await this.prisma.endpoint.findUnique({
      where: { id: event.endpointId }
    });

    if (!endpoint || !endpoint.enabled) {
      const errorMsg = !endpoint
        ? 'Endpoint no longer exists'
        : 'Endpoint is disabled';

      logger.warn(`Delivery aborted for event ${event.id}: ${errorMsg}`);

      await this.prisma.deliveryAttempt.create({
        data: {
          id: attemptId,
          eventId: event.id,
          attemptNumber,
          statusCode: null,
          responseBody: null,
          errorMessage: errorMsg,
          latencyMs: 0,
          startedAt,
          completedAt: new Date()
        }
      });

      await this.prisma.event.update({
        where: { id: event.id },
        data: {
          status: 'FAILED',
          attempts: attemptNumber,
          lockedAt: null,
          lockedBy: null
        }
      });

      return { success: false, retryable: false, error: errorMsg };
    }

    // 2. Validate destination URL against SSRF policy at delivery time
    const ssrfCheck = await validateDestinationUrl(endpoint.destinationUrl);
    if (!ssrfCheck.valid) {
      const errorMsg = `SSRF check failed: ${ssrfCheck.error}`;
      logger.warn(`Delivery aborted for event ${event.id}: ${errorMsg}`);

      await this.prisma.deliveryAttempt.create({
        data: {
          id: attemptId,
          eventId: event.id,
          attemptNumber,
          statusCode: null,
          responseBody: null,
          errorMessage: errorMsg,
          latencyMs: 0,
          startedAt,
          completedAt: new Date()
        }
      });

      await this.prisma.event.update({
        where: { id: event.id },
        data: {
          status: 'FAILED',
          attempts: attemptNumber,
          lockedAt: null,
          lockedBy: null
        }
      });

      return { success: false, retryable: false, error: errorMsg };
    }

    // 3. Prepare payload envelope and signing
    let dataPayload;
    try {
      dataPayload = JSON.parse(event.payload);
    } catch {
      dataPayload = event.payload;
    }

    const envelope = {
      event_id: event.id,
      event_type: event.eventType,
      timestamp: event.createdAt.toISOString(),
      data: dataPayload
    };

    const serializedBody = JSON.stringify(envelope);
    const signature = generateSignature(serializedBody, endpoint.signingSecret);

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'HookRelay-Worker/1.0',
      'X-HookRelay-Event-Id': event.id,
      'X-HookRelay-Event-Type': event.eventType,
      'X-HookRelay-Delivery-Attempt': String(attemptNumber),
      'X-HookRelay-Signature': signature
    };

    // 4. Perform outbound HTTP POST request
    let statusCode = null;
    let responseBody = null;
    let errorMessage = null;
    let retryAfterHeader = null;
    let isSuccess = false;
    let isRetryable = false;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.worker.deliveryTimeoutMs);

    const requestStartMs = Date.now();
    try {
      const response = await fetch(endpoint.destinationUrl, {
        method: 'POST',
        headers,
        body: serializedBody,
        signal: controller.signal,
        redirect: 'manual' // Prevent following redirects automatically to protect against SSRF bypass
      });

      clearTimeout(timeoutId);
      statusCode = response.status;
      retryAfterHeader = response.headers.get('retry-after');

      // Read response body safely with truncation limit
      try {
        const text = await response.text();
        if (text) {
          responseBody = text.length > config.worker.maxResponseBodyBytes
            ? text.slice(0, config.worker.maxResponseBodyBytes) + '... [truncated]'
            : text;
        }
      } catch (bodyErr) {
        responseBody = `[Error reading response body: ${bodyErr.message}]`;
      }

      // Check success vs failure
      if (statusCode >= 200 && statusCode < 300) {
        isSuccess = true;
      } else {
        isSuccess = false;
        errorMessage = `HTTP ${statusCode}: ${response.statusText || 'Error response'}`;
        // Retryable: 408 (Timeout), 429 (Rate Limit), 5xx (Server Error)
        if (statusCode === 408 || statusCode === 429 || (statusCode >= 500 && statusCode < 600)) {
          isRetryable = true;
        } else {
          // Other 4xx are permanent failures
          isRetryable = false;
        }
      }
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      isSuccess = false;
      isRetryable = true; // Connection refused, DNS failure, timeout are retryable
      statusCode = null;

      if (fetchErr.name === 'AbortError') {
        errorMessage = `Request timed out after ${config.worker.deliveryTimeoutMs}ms`;
      } else {
        errorMessage = `Network error: ${fetchErr.message}`;
      }
    }

    const completedAt = new Date();
    const latencyMs = Math.max(0, Date.now() - requestStartMs);

    // 5. Persist the delivery attempt record
    await this.prisma.deliveryAttempt.create({
      data: {
        id: attemptId,
        eventId: event.id,
        attemptNumber,
        statusCode,
        responseBody,
        errorMessage,
        latencyMs,
        startedAt,
        completedAt
      }
    });

    // 6. Update event status
    if (isSuccess) {
      await this.prisma.event.update({
        where: { id: event.id },
        data: {
          status: 'DELIVERED',
          attempts: attemptNumber,
          lockedAt: null,
          lockedBy: null
        }
      });
      logger.info(`Event ${event.id} successfully delivered (HTTP ${statusCode}) in ${latencyMs}ms`);
      return { success: true, statusCode, latencyMs };
    }

    // Handle failure
    const maxRetries = event.maxRetries;
    const hasRetriesRemaining = isRetryable && attemptNumber < maxRetries;

    if (hasRetriesRemaining) {
      const backoffMs = queueService.calculateBackoffMs(attemptNumber, retryAfterHeader);
      const nextAttemptAt = new Date(Date.now() + backoffMs);

      await this.prisma.event.update({
        where: { id: event.id },
        data: {
          status: 'RETRYING',
          attempts: attemptNumber,
          nextAttemptAt,
          lockedAt: null,
          lockedBy: null
        }
      });

      logger.warn(`Event ${event.id} delivery failed (attempt ${attemptNumber}/${maxRetries}). Scheduling retry in ${backoffMs}ms at ${nextAttemptAt.toISOString()}: ${errorMessage}`);
      return { success: false, retryable: true, nextAttemptAt, errorMessage };
    } else {
      // Terminal failure
      await this.prisma.event.update({
        where: { id: event.id },
        data: {
          status: 'FAILED',
          attempts: attemptNumber,
          lockedAt: null,
          lockedBy: null
        }
      });

      logger.error(`Event ${event.id} permanently failed after ${attemptNumber} attempts: ${errorMessage}`);
      return { success: false, retryable: false, errorMessage };
    }
  }
}

export const deliveryService = new DeliveryService();
