import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { healthRouter } from './routes/healthRoutes.js';
import { endpointRouter } from './routes/endpointRoutes.js';
import { eventRouter } from './routes/eventRoutes.js';
import { metricsRouter } from './routes/metricsRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, '../../client/dist');

export function createApp() {
  const app = express();

  // Basic security and parsing middleware
  const corsOptions = config.security.corsOrigin === '*'
    ? { origin: true }
    : { origin: config.security.corsOrigin.split(',').map((o) => o.trim()), credentials: true };
  app.use(cors(corsOptions));
  app.use(express.json({ limit: `${config.security.maxPayloadBytes}b` }));

  // Request logger for API calls
  if (config.nodeEnv !== 'test') {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        // Skip spamming logs for health polls unless errored
        if (req.path === '/api/health' && res.statusCode === 200) return;
        console.log(`[API] ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
      });
      next();
    });
  }

  // Mount API routes
  app.use('/api', healthRouter);
  app.use('/api', endpointRouter);
  app.use('/api', eventRouter);
  app.use('/api', metricsRouter);

  // Serve production client build if available
  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }

  // 404 handler for unknown API routes
  app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
  });

  // Centralized error handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
