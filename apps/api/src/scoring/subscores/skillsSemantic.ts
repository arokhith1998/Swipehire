/**
 * skillsSemantic — semantic similarity between user skills and JD requirements.
 * Replaces v1's naive substring match.
 *
 * Strategy (per docs/02_algorithm_v2.md §3.1):
 *   1. Normalize all skills via skill_taxonomy (canonical + aliases)
 *   2. Embed unmapped strings via ml-sidecar /embed
 *   3. Cosine similarity ≥ 0.78 → match
 *   4. JD evidence matching for tailoring (separate flow)
 */

import type { Subscore } from '@swipehire/shared';
import type { ExtractedFeatures } from '../featureExtractor.js';
import { embed, batchEmbed } from '../../ml/inferenceClient.js';

const SIMILARITY_THRESHOLD = 0.78;

export async function skillsSemantic(features: ExtractedFeatures): Promise<Subscore> {
  const userSkills = features.userSkillsCanonical;
  const jdSkills = features.jdSkillsCanonical;

  if (jdSkills.length === 0) {
    return {
      value: 0.5, // neutral when no skills extracted
      weight: 0,
      confidence: 0.1,
      evidence: ['No skills could be extracted from the job description'],
    };
  }
  if (userSkills.length === 0) {
    return {
      value: 0.0,
      weight: 0,
      confidence: 0.5,
      evidence: ['Resume has no parsed skills — improve onboarding to fix'],
    };
  }

  // Step 1: exact canonical matches
  const userSet = new Set(userSkills.map(s => s.toLowerCase()));
  const exactMatches = jdSkills.filter(s => userSet.has(s.toLowerCase()));

  // Step 2: semantic match for unmapped JD skills via embeddings
  const unmappedJd = jdSkills.filter(s => !userSet.has(s.toLowerCase()));
  let semanticMatches: string[] = [];

  if (unmappedJd.length > 0) {
    try {
      const [userEmbeds, jdEmbeds] = await Promise.all([
        batchEmbed(userSkills),
        batchEmbed(unmappedJd),
      ]);
      semanticMatches = unmappedJd.filter((_, i) => {
        const jdVec = jdEmbeds[i];
        return userEmbeds.some(uVec => cosine(uVec, jdVec) >= SIMILARITY_THRESHOLD);
      });
    } catch (err) {
      // Sidecar down — fall back to exact-only matching, lower confidence
      console.warn('[skillsSemantic] embed failed, falling back:', err);
    }
  }

  const totalMatched = exactMatches.length + semanticMatches.length;
  const value = totalMatched / jdSkills.length;
  const matchedSkills = [...exactMatches, ...semanticMatches];

  return {
    value: Math.min(value, 1),
    weight: 0, // applied by combiner
    confidence: jdSkills.length >= 3 ? 0.9 : 0.6,
    evidence: matchedSkills.length > 0
      ? [`Matched ${matchedSkills.length}/${jdSkills.length} JD skills: ${matchedSkills.slice(0, 5).join(', ')}${matchedSkills.length > 5 ? '...' : ''}`]
      : [`No skill matches found among ${jdSkills.length} JD requirements`],
  };
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}
