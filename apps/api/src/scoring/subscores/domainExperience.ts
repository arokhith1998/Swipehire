/**
 * domainExperience — industry/vertical match between user's prior roles and JD.
 *
 * v2.1: extract industry from JD via classifier; cross-ref with user's resume
 * employer history (linked to a Crunchbase-derived company → industry map).
 *
 * v2.0 stub: keyword overlap on common verticals.
 */

import type { Subscore } from '@swipehire/shared';
import type { ExtractedFeatures } from '../featureExtractor.js';

const VERTICALS = [
  'fintech', 'healthcare', 'edtech', 'e-commerce', 'b2b saas', 'b2c',
  'marketplace', 'subscription', 'enterprise', 'gaming', 'media', 'logistics',
  'insurance', 'real estate', 'climate', 'crypto', 'mobility', 'travel',
];

export async function domainExperience(features: ExtractedFeatures): Promise<Subscore> {
  const jdNorm = features.jdText.toLowerCase();
  const resumeNorm = features.resumeText.toLowerCase();

  const jdVerticals = VERTICALS.filter(v => jdNorm.includes(v));
  const resumeVerticals = VERTICALS.filter(v => resumeNorm.includes(v));

  if (jdVerticals.length === 0) {
    return {
      value: 0.5, weight: 0, confidence: 0.2,
      evidence: ['JD does not mention a clear industry vertical'],
    };
  }

  const matched = jdVerticals.filter(v => resumeVerticals.includes(v));
  const value = matched.length === 0 ? 0 : Math.min(matched.length / jdVerticals.length, 1);

  return {
    value,
    weight: 0,
    confidence: 0.5,
    evidence: matched.length > 0
      ? [`Domain match: ${matched.join(', ')}`]
      : [`JD verticals (${jdVerticals.join(', ')}) not present in resume`],
  };
}
