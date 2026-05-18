/**
 * /api/ask — RAG-powered Q&A. Authenticated.
 *
 * Body: { question, kinds?, k? }
 *   kinds: optional list of knowledge kinds to filter by
 *          ('company_visa' | 'immigration_rule' | 'role_norms' | 'salary_band')
 *   k:     top-K retrieval (default 6)
 *
 * Returns: { answer, citations, modelVersion }
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { ask } from '../../services/rag/index.js';

export const askRouter: Router = Router();

function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) { res.status(401).json({ error: 'not_authenticated' }); return; }
  next();
}

const askSchema = z.object({
  question: z.string().min(3).max(800),
  kinds: z.array(z.enum(['company_visa', 'immigration_rule', 'role_norms', 'salary_band'])).optional(),
  k: z.number().int().min(1).max(20).optional(),
});

askRouter.post('/api/ask', requireUser, async (req: Request, res: Response) => {
  const parsed = askSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
    return;
  }
  try {
    const result = await ask(parsed.data.question, { k: parsed.data.k, kinds: parsed.data.kinds });
    res.json(result);
  } catch (err: any) {
    if (err.message === 'OPENAI_API_KEY not configured') {
      res.status(503).json({ error: 'openai_not_configured' });
      return;
    }
    res.status(500).json({ error: 'ask_failed', message: err.message?.slice(0, 200) });
  }
});
