/**
 * Honesty Dashboard public route.
 * GET /api/honesty → returns HonestyMetrics JSON. Cached 1 hour.
 */

import { Router, type Router as RouterType } from 'express';
import { computeHonestyMetrics } from './metrics.js';
import { flags } from '../config/flags.js';

export const honestyRouter: RouterType = Router();

let cache: { computedAt: number; data: any } | null = null;
const CACHE_MS = 60 * 60 * 1000;  // 1 hour

honestyRouter.get('/api/honesty', async (req, res) => {
  if (!flags.HONESTY_DASHBOARD_PUBLIC) {
    return res.status(404).json({ error: 'Not enabled' });
  }
  if (cache && Date.now() - cache.computedAt < CACHE_MS) {
    return res.json(cache.data);
  }
  try {
    const data = await computeHonestyMetrics();
    cache = { computedAt: Date.now(), data };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute metrics', detail: String(err) });
  }
});
