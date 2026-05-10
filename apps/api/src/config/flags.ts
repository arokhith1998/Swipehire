/**
 * Feature flags — gate v2 functionality during the migration from v1.
 * Read once at startup; values fixed for the process lifetime.
 *
 * Per-user / per-route overrides happen in middleware (see src/middleware/flags.ts).
 */

const truthy = (v: string | undefined) => v === 'true' || v === '1';

export const flags = Object.freeze({
  /** Use v2 calibrated matcher instead of v1 weighted-sum jobMatcher.ts. */
  USE_V2_MATCHER: truthy(process.env.USE_V2_MATCHER),

  /** Use v2 evidence-grounded tailoring instead of v1 single OpenAI call. */
  USE_V2_TAILORING: truthy(process.env.USE_V2_TAILORING),

  /** Run liveness checker (safe to enable from day one). */
  USE_V2_LIVENESS: truthy(process.env.USE_V2_LIVENESS),

  /** Use real DOL OFLC visa intel instead of v1 hardcoded big-tech table. */
  USE_V2_VISA: truthy(process.env.USE_V2_VISA),

  /** Honesty Dashboard public visibility. */
  HONESTY_DASHBOARD_PUBLIC: truthy(process.env.HONESTY_DASHBOARD_PUBLIC ?? 'true'),

  /** ML sidecar fallback (in-process WASM embedder) when sidecar is unreachable. */
  ML_FALLBACK_ENABLED: truthy(process.env.ML_FALLBACK_ENABLED ?? 'true'),

  /** Shadow mode: every v1 score also produces a v2 score, both logged to audit. */
  SHADOW_V2_SCORING: truthy(process.env.SHADOW_V2_SCORING ?? 'false'),
});

export type Flags = typeof flags;
