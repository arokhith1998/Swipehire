/**
 * /api/dashboard — user-facing aggregates for today + lifetime activity.
 *
 * Routes:
 *   GET /api/dashboard/stats   { todayStats: { viewed, liked, applied }, lifetime: {...} }
 */

import { Router, type Request, type Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '@swipehire/db';

export const dashboardRouter: Router = Router();

dashboardRouter.get('/api/dashboard/stats', async (req: Request, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: 'not_authenticated' });

  // Today's interactions, grouped by action.
  const todayRows = await db.execute(sql`
    SELECT action, COUNT(*)::int AS n
    FROM user_job_interactions
    WHERE user_id = ${userId}
      AND created_at >= date_trunc('day', NOW())
    GROUP BY action
  `);
  const todayMap: Record<string, number> = {};
  for (const row of (todayRows.rows ?? []) as any[]) {
    todayMap[row.action] = row.n;
  }

  const todayStats = {
    viewed: (todayMap['swipe_left'] ?? 0) + (todayMap['swipe_right'] ?? 0) + (todayMap['bookmark'] ?? 0),
    liked: (todayMap['swipe_right'] ?? 0) + (todayMap['bookmark'] ?? 0),
    applied: todayMap['apply'] ?? 0,
  };

  // Lifetime totals.
  const lifeRows = await db.execute(sql`
    SELECT action, COUNT(*)::int AS n
    FROM user_job_interactions
    WHERE user_id = ${userId}
    GROUP BY action
  `);
  const lifeMap: Record<string, number> = {};
  for (const row of (lifeRows.rows ?? []) as any[]) {
    lifeMap[row.action] = row.n;
  }
  const lifetime = {
    viewed: (lifeMap['swipe_left'] ?? 0) + (lifeMap['swipe_right'] ?? 0) + (lifeMap['bookmark'] ?? 0),
    liked: (lifeMap['swipe_right'] ?? 0) + (lifeMap['bookmark'] ?? 0),
    applied: lifeMap['apply'] ?? 0,
  };

  res.json({ todayStats, lifetime });
});
