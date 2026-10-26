import { Router } from 'express';
import { metricsService } from '../services/metricsService.js';

export const metricsRouter = Router();

// Overview metrics for dashboard
metricsRouter.get('/overview', async (req, res, next) => {
  try {
    const metrics = await metricsService.getOverviewMetrics();
    return res.json(metrics);
  } catch (err) {
    next(err);
  }
});
