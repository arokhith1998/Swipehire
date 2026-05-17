/**
 * Combiner — weighted sum of subscores with role-family-conditional weights.
 *
 * Default weights are bootstrapped from logistic regression on a labeled set.
 * Per-role-family weights are loaded from ml.calibration_models once enough
 * outcome data exists (≥1k outcomes per family).
 */

import type { Subscore, SubscoreKey } from '@swipehire/shared';

/**
 * Default weights — used when no role-family-specific weights are loaded.
 *
 * Rebalanced 2026-05-16 to lean harder on signals candidates care about
 * (skills + title) and de-emphasise weak ones (recency, salary band).
 * Without this, even a perfect title + 80% skill match capped around 50%
 * because the long tail of lukewarm subscores dragged the weighted average
 * down.
 */
const DEFAULT_WEIGHTS: Record<SubscoreKey, number> = {
  skillsSemantic:    0.32,   // was 0.30
  titleAlignment:    0.26,   // was 0.18 — the biggest user-perceptible signal
  seniorityFit:      0.12,
  locationFit:       0.08,   // was 0.10
  domainExperience:  0.08,
  visaCompatibility: 0.08,   // was 0.10
  salaryFit:         0.03,   // was 0.06 — often missing, kept low weight
  recencySignal:     0.03,   // was 0.06 — same reason
};

/** Per-role-family overrides — populated from ml.calibration_models in v2.1. */
const ROLE_FAMILY_WEIGHTS = new Map<number, Record<SubscoreKey, number>>();

export interface CombineResult {
  raw: number;
  weights: Record<SubscoreKey, number>;
}

/**
 * Combine subscores into a raw score in [0,1].
 *
 * Anti-inflation rule: if a subscore has confidence: 0 (e.g. salary missing),
 * we redistribute its weight proportionally to the other subscores instead of
 * including a guess.
 */
export function combine(
  subscores: Record<SubscoreKey, Subscore>,
  roleFamilyId: number | null
): CombineResult {
  const baseWeights = (roleFamilyId && ROLE_FAMILY_WEIGHTS.get(roleFamilyId)) || DEFAULT_WEIGHTS;
  const weights = redistributeForLowConfidence(subscores, baseWeights);

  let raw = 0;
  for (const key of Object.keys(weights) as SubscoreKey[]) {
    raw += weights[key] * subscores[key].value;
  }

  // Title-match floor boost: when the job's title aligns strongly with the
  // user's target role, the candidate WILL meaningfully consider it even if
  // location/salary/etc. are imperfect. Without this, a literal "Marketing
  // Analyst" job for a user targeting "Marketing Analyst" caps around 40%
  // because the long tail of weaker subscores drags the weighted average
  // down. Boost is bounded so it never pushes a poor match into "Strong fit".
  const title = subscores.titleAlignment?.value ?? 0;
  if (title >= 0.85) {
    raw = Math.min(1, raw + 0.20);
  } else if (title >= 0.65) {
    raw = Math.min(1, raw + 0.10);
  }

  return { raw: Math.max(0, Math.min(1, raw)), weights };
}

/**
 * If a subscore has confidence: 0 (we explicitly know we don't know), drop its
 * weight to 0 and renormalize the remaining weights to sum to 1.
 *
 * This prevents missing data from being scored as "neutral" (0.5 with full weight).
 */
function redistributeForLowConfidence(
  subscores: Record<SubscoreKey, Subscore>,
  base: Record<SubscoreKey, number>
): Record<SubscoreKey, number> {
  const adjusted = { ...base };
  let removedWeight = 0;
  for (const key of Object.keys(base) as SubscoreKey[]) {
    if (subscores[key].confidence === 0) {
      removedWeight += adjusted[key];
      adjusted[key] = 0;
    }
  }
  if (removedWeight === 0) return adjusted;
  const remainingTotal = 1 - removedWeight;
  if (remainingTotal === 0) return adjusted; // pathological: no signal at all
  // Scale remaining proportionally
  for (const key of Object.keys(adjusted) as SubscoreKey[]) {
    adjusted[key] = adjusted[key] / remainingTotal;
  }
  return adjusted;
}
