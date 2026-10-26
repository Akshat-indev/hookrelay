import { z } from 'zod';
import { getPrismaClient } from '../db/prisma.js';
import { generateId } from '../lib/id.js';
import { generateSigningSecret } from '../lib/crypto.js';
import { validateDestinationUrl } from './ssrfService.js';
import { AppError } from '../middleware/errorHandler.js';

export const createEndpointSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
  destinationUrl: z.string().url('Invalid destination URL format'),
  maxRetries: z.number().int().min(0, 'maxRetries cannot be negative').max(20, 'maxRetries cannot exceed 20').default(5)
});

export const updateEndpointSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  destinationUrl: z.string().url('Invalid destination URL format').optional(),
  maxRetries: z.number().int().min(0).max(20).optional(),
  enabled: z.boolean().optional()
});

export class EndpointService {
  constructor(prisma = getPrismaClient()) {
    this.prisma = prisma;
  }

  async createEndpoint(data) {
    const validated = createEndpointSchema.parse(data);

    // SSRF Destination Validation
    const ssrfCheck = await validateDestinationUrl(validated.destinationUrl);
    if (!ssrfCheck.valid) {
      throw new AppError(`Destination URL rejected: ${ssrfCheck.error}`, 400);
    }

    const id = generateId('ep');
    const signingSecret = generateSigningSecret();

    const endpoint = await this.prisma.endpoint.create({
      data: {
        id,
        name: validated.name,
        destinationUrl: validated.destinationUrl,
        signingSecret,
        maxRetries: validated.maxRetries ?? 5,
        enabled: true
      }
    });

    // Return full endpoint including signingSecret ONCE upon creation
    return {
      ...endpoint,
      warning: 'Save this signing secret now. It will never be displayed again.'
    };
  }

  async listEndpoints() {
    const endpoints = await this.prisma.endpoint.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        destinationUrl: true,
        maxRetries: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { events: true }
        }
      }
    });

    return endpoints;
  }

  async getEndpoint(id) {
    const endpoint = await this.prisma.endpoint.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        destinationUrl: true,
        maxRetries: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { events: true }
        }
      }
    });

    if (!endpoint) {
      throw new AppError(`Endpoint with id "${id}" not found`, 404);
    }

    return endpoint;
  }

  async updateEndpoint(id, data) {
    const validated = updateEndpointSchema.parse(data);

    // If destinationUrl is being changed, re-validate SSRF
    if (validated.destinationUrl) {
      const ssrfCheck = await validateDestinationUrl(validated.destinationUrl);
      if (!ssrfCheck.valid) {
        throw new AppError(`Destination URL rejected: ${ssrfCheck.error}`, 400);
      }
    }

    // Verify endpoint exists
    await this.getEndpoint(id);

    const updated = await this.prisma.endpoint.update({
      where: { id },
      data: validated,
      select: {
        id: true,
        name: true,
        destinationUrl: true,
        maxRetries: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { events: true }
        }
      }
    });

    return updated;
  }

  async deleteEndpoint(id) {
    const endpoint = await this.getEndpoint(id);

    // If endpoint has events, disable it to preserve delivery history
    const eventCount = await this.prisma.event.count({
      where: { endpointId: id }
    });

    if (eventCount > 0) {
      const disabled = await this.prisma.endpoint.update({
        where: { id },
        data: { enabled: false },
        select: {
          id: true,
          name: true,
          destinationUrl: true,
          maxRetries: true,
          enabled: true,
          createdAt: true,
          updatedAt: true
        }
      });
      return {
        action: 'disabled',
        message: 'Endpoint has associated events and was disabled to preserve delivery history',
        endpoint: disabled
      };
    }

    // Otherwise permanently delete
    await this.prisma.endpoint.delete({
      where: { id }
    });

    return {
      action: 'deleted',
      message: 'Endpoint deleted successfully',
      id
    };
  }
}

export const endpointService = new EndpointService();
