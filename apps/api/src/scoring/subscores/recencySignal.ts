/**
 * recencySignal — penalize old postings; reward fresh ones with recruiter activity.
 * Combined with the authenticity layer to suppress ghosts.
 */

import type { Subscore } from '@swipehire/shared';
import type { ExtractedFeatures } from '../featureExtractor.js';

export async function recencySignal(features: ExtractedFeatures): Promise<Subscore> {
  const { daysSincePosted } = features;
  if (daysSincePosted == null) {
    return {
      value: 0.5, weight: 0, confidence: 0.2,
      evidence: ['Posting date unknown'],
    };
  }
  // Exponential decay with τ = 14 days. Clamp negative ages (clock skew, future
  // postings) to "fresh" rather than letting exp(-negative/14) exceed 1.0.
  const ageDays = Math.max(daysSincePosted, 0);
  const value = Math.exp(-ageDays / 14);
  return {
    value: Math.min(Math.max(value, 0.05), 1),
    weight: 0,
    confidence: 0.9,
    evidence: [`Posted ${Math.max(daysSincePosted, 0)}d ago`],
  };
}
