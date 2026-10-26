import { Router } from 'express';
import { eventService } from '../services/eventService.js';

export const eventRouter = Router();

// Ingest event for an endpoint
eventRouter.post('/endpoints/:id/events', async (req, res, next) => {
  try {
    const idempotencyKey = req.headers['idempotency-key'] || null;
    const result = await eventService.ingestEvent(req.params.id, req.body, idempotencyKey);
    // If idempotency was reused and matched, status is 200, otherwise 202 Accepted
    const status = result.idempotent_replayed ? 200 : 202;
    return res.status(status).json(result);
  } catch (err) {
    next(err);
  }
});

// List events with filters and pagination
eventRouter.get('/events', async (req, res, next) => {
  try {
    const result = await eventService.listEvents(req.query);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get single event details with full attempt history
eventRouter.get('/events/:id', async (req, res, next) => {
  try {
    const event = await eventService.getEvent(req.params.id);
    return res.json(event);
  } catch (err) {
    next(err);
  }
});

// Manual replay of an event
eventRouter.post('/events/:id/replay', async (req, res, next) => {
  try {
    const result = await eventService.replayEvent(req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});
