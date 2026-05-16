/**
 * /api/debug/playwright — one-shot diagnostic so we know which path the
 * Chromium binary actually landed in on Railway's runtime image.
 * Remove once HTML→PDF generation is confirmed working.
 */
import { Router, type Request, type Response } from 'express';
import { existsSync, readdirSync } from 'node:fs';

export const debugRouter: Router = Router();

debugRouter.get('/api/debug/playwright', (_req: Request, res: Response) => {
  const candidates = [
    '/root/.cache/ms-playwright',
    '/app/.cache/ms-playwright',
    process.env.PLAYWRIGHT_BROWSERS_PATH || '',
    process.env.HOME ? `${process.env.HOME}/.cache/ms-playwright` : '',
  ].filter(Boolean);

  const result: Record<string, any> = {
    env: {
      PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? null,
      HOME: process.env.HOME ?? null,
      USER: process.env.USER ?? null,
      cwd: process.cwd(),
    },
    paths: {},
  };
  for (const p of candidates) {
    try {
      result.paths[p] = existsSync(p) ? readdirSync(p) : 'MISSING';
    } catch (e: any) {
      result.paths[p] = `ERR: ${e.message}`;
    }
  }
  res.json(result);
});
