/**
 * Calibrator — turn raw combiner output into a calibrated interview probability
 * with a 90% confidence interval.
 *
 * Strategy (per docs/02_algorithm_v2.md §4):
 *   - Call ml-sidecar /score with the raw + per-subscore values.
 *   - Sidecar runs IsotonicRegression + bootstrap CI from current model artifact.
 *   - Returns probability + CI + label.
 *
 * Anti-inflation: if average subscore confidence < 0.4, return label='Insufficient data'
 * with interviewProbability=null. Hard rule from §4.4.
 */

import type { MatchLabel, Subscore, SubscoreKey } from '@swipehire/shared';
import { score as mlScore } from '../ml/inferenceClient.js';

export interface CalibrateInput {
  raw: number;
  subscores: Record<SubscoreKey, Subscore>;
  roleFamilyId: number | null;
  modelVersionOverride?: string;
}

export interface CalibrateOutput {
  interviewProbability: number | null;
  confidenceInterval: [number, number] | null;
  label: MatchLabel;
  modelVersion: string;
}

const INSUFFICIENT_DATA_THRESHOLD = 0.4;

export async function calibrate(input: CalibrateInput): Promise<CalibrateOutput> {
  // Anti-inflation gate: refuse to score if data confidence is too low.
  const considered = (Object.keys(input.subscores) as SubscoreKey[])
    .filter(k => input.subscores[k].weight > 0);
  const avgConfidence = considered.length === 0
    ? 0
    : considered.reduce((acc, k) => acc + input.subscores[k].confidence, 0) / considered.length;

  if (avgConfidence < INSUFFICIENT_DATA_THRESHOLD) {
    return {
      interviewProbability: null,
      confidenceInterval: null,
      label: 'Insufficient data',
      modelVersion: 'pre-calibration-gate',
    };
  }

  // Call ML sidecar for calibrated probability + CI.
  let p: number, ciLow: number, ciHigh: number, modelVersion: string;
  try {
    const result = await mlScore({
      raw: input.raw,
      role_family_id: input.roleFamilyId,
      model_version_override: input.modelVersionOverride,
    });
    p = result.probability;
    ciLow = result.ci_low;
    ciHigh = result.ci_high;
    modelVersion = result.model_version;
  } catch (err) {
    // Fallback: identity calibration with wide CI (we admit we don't know).
    console.warn('[calibrator] sidecar score failed, using identity fallback:', err);
    p = input.raw;
    const fallbackHalfWidth = 0.20;
    ciLow = Math.max(0, p - fallbackHalfWidth);
    ciHigh = Math.min(1, p + fallbackHalfWidth);
    modelVersion = 'fallback-identity';
  }

  const label = deriveLabel(p, ciLow, ciHigh);

  return {
    interviewProbability: p,
    confidenceInterval: [ciLow, ciHigh],
    label,
    modelVersion,
  };
}

/**
 * Label derivation — combines probability AND CI width.
 * A 0.80 score with [0.40, 0.95] CI is "Insufficient data," not "Strong fit."
 * This is the structural anti-inflation guarantee.
 */
function deriveLabel(p: number, ciLow: number, ciHigh: number): MatchLabel {
  const ciWidth = ciHigh - ciLow;
  if (ciWidth > 0.40) return 'Insufficient data';
  if (p >= 0.70 && ciWidth <= 0.20) return 'Strong fit';
  if (p >= 0.55 && ciWidth <= 0.30) return 'Promising fit';
  if (p >= 0.35) return 'Stretch';
  return 'Weak fit';
}
