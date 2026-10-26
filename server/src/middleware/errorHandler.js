import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';
import { config } from '../config/index.js';

export class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function errorHandler(err, req, res, next) {
  // If headers already sent, delegate to Express default error handler
  if (res.headersSent) {
    return next(err);
  }

  // Zod validation error
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message
      }))
    });
  }

  // Body parser JSON syntax error
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'Malformed JSON payload'
    });
  }

  // Custom AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {})
    });
  }

  logger.error(`Unhandled error on ${req.method} ${req.url}: ${err.message}`, {
    stack: config.nodeEnv === 'development' ? err.stack : undefined
  });

  return res.status(500).json({
    error: 'Internal server error'
  });
}
