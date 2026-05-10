/**
 * titleAlignment — role family match + seniority distance.
 * Replaces v1's word-overlap calculation.
 *
 * Per docs/02_algorithm_v2.md §3.2:
 *   - Same family       → 1.0
 *   - Sibling family    → 0.7
 *   - Related family    → 0.4
 *   - Unrelated         → 0.1
 */

import type { Subscore } from '@swipehire/shared';
import type { ExtractedFeatures } from '../featureExtractor.js';

export async function titleAlignment(features: ExtractedFeatures): Promise<Subscore> {
  const { job, userTargetRoleFamilies } = features;

  if (!userTargetRoleFamilies.length) {
    return {
      value: 0.5,
      weight: 0,
      confidence: 0.3,
      evidence: ['User has not set target role families — improve onboarding'],
    };
  }

  // TODO(v2.1): join with ml.role_families to get family + siblings + related arrays.
  // For now: case-insensitive substring against target families and the job title.
  const jobTitleNorm = job.title.toLowerCase();

  let bestMatch: { family: string; score: number } | null = null;
  for (const family of userTargetRoleFamilies) {
    const familyNorm = family.toLowerCase();
    let score = 0;
    if (jobTitleNorm.includes(familyNorm) || familyNorm.includes(jobTitleNorm)) {
      score = 1.0;
    } else {
      // Token Jaccard
      const titleTokens = new Set(jobTitleNorm.split(/\W+/).filter(Boolean));
      const familyTokens = new Set(familyNorm.split(/\W+/).filter(Boolean));
      const intersect = [...titleTokens].filter(t => familyTokens.has(t));
      const union = new Set([...titleTokens, ...familyTokens]);
      const jaccard = intersect.length / union.size;
      score = jaccard >= 0.5 ? 0.7 : jaccard >= 0.25 ? 0.4 : 0.1;
    }
    if (!bestMatch || score > bestMatch.score) bestMatch = { family, score };
  }

  return {
    value: bestMatch?.score ?? 0.1,
    weight: 0,
    confidence: 0.85,
    evidence: bestMatch
      ? [`Title "${job.title}" aligns with target "${bestMatch.family}" (score ${bestMatch.score.toFixed(2)})`]
      : [`Title "${job.title}" does not align with any target family`],
  };
}
