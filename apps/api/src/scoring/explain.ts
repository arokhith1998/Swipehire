/**
 * Build the user-facing "why this score" explanation.
 *
 * Picks the top reasons to apply / hesitate from the subscores' evidence,
 * surfaces missing JD requirements that the user could address with tailoring.
 */

import type { Explain, Subscore, SubscoreKey } from '@swipehire/shared';
import type { ExtractedFeatures } from './featureExtractor.js';
import type { CalibrateOutput } from './calibrator.js';
import type { ScoringUser, ScoringJob } from './matcher.js';

interface BuildExplainInput {
  user: ScoringUser;
  job: ScoringJob;
  features: ExtractedFeatures;
  subscores: Record<SubscoreKey, Subscore>;
  calibration: CalibrateOutput;
  visaIntel?: any;
  durationMs: number;
}

export function buildExplain(input: BuildExplainInput): Explain {
  const { subscores, features, calibration, durationMs } = input;

  // Top reasons to apply: subscores with value ≥ 0.7 AND weight > 0
  const reasonsToApply = (Object.keys(subscores) as SubscoreKey[])
    .filter(k => subscores[k].value >= 0.7 && subscores[k].weight > 0)
    .sort((a, b) => subscores[b].value * subscores[b].weight - subscores[a].value * subscores[a].weight)
    .slice(0, 3)
    .map(k => subscores[k].evidence?.[0] ?? `${k}: ${subscores[k].value.toFixed(2)}`);

  // Top reasons to hesitate: subscores with value ≤ 0.4 AND weight > 0.05
  const reasonsToHesitate = (Object.keys(subscores) as SubscoreKey[])
    .filter(k => subscores[k].value <= 0.4 && subscores[k].weight > 0.05)
    .sort((a, b) => subscores[a].value * subscores[a].weight - subscores[b].value * subscores[b].weight)
    .slice(0, 3)
    .map(k => subscores[k].evidence?.[0] ?? `${k}: ${subscores[k].value.toFixed(2)}`);

  // Missing evidence: JD skills the user couldn't match
  const missingEvidence = features.jdSkillsCanonical.filter(
    s => !features.userSkillsCanonical.some(u => u.toLowerCase() === s.toLowerCase())
  );

  return {
    topReasonsToApply: reasonsToApply,
    topReasonsToHesitate: reasonsToHesitate,
    missingEvidence,
    modelVersion: calibration.modelVersion,
    scoredAt: new Date().toISOString(),
  };
}
