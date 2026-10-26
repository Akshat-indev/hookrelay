import { Router } from 'express';
import { endpointService } from '../services/endpointService.js';

export const endpointRouter = Router();

// Create endpoint
endpointRouter.post('/endpoints', async (req, res, next) => {
  try {
    const endpoint = await endpointService.createEndpoint(req.body);
    return res.status(201).json(endpoint);
  } catch (err) {
    next(err);
  }
});

// List endpoints
endpointRouter.get('/endpoints', async (req, res, next) => {
  try {
    const endpoints = await endpointService.listEndpoints();
    return res.json(endpoints);
  } catch (err) {
    next(err);
  }
});

// Get endpoint details
endpointRouter.get('/endpoints/:id', async (req, res, next) => {
  try {
    const endpoint = await endpointService.getEndpoint(req.params.id);
    return res.json(endpoint);
  } catch (err) {
    next(err);
  }
});

// Update endpoint
endpointRouter.patch('/endpoints/:id', async (req, res, next) => {
  try {
    const updated = await endpointService.updateEndpoint(req.params.id, req.body);
    return res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Delete or disable endpoint
endpointRouter.delete('/endpoints/:id', async (req, res, next) => {
  try {
    const result = await endpointService.deleteEndpoint(req.params.id);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});
