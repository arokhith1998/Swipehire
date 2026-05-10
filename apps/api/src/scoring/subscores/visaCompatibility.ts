/**
 * visaCompatibility — thin wrapper that delegates to the visa subsystem.
 * Keeps the subscores folder uniform.
 */

import type { Subscore } from '@swipehire/shared';
import type { ExtractedFeatures } from '../featureExtractor.js';
import { calculateVisaCompatibility } from '../../visa/compatibility.js';

export async function visaCompatibility(features: ExtractedFeatures): Promise<Subscore> {
  if (!features.needsSponsorship) {
    return { value: 1, weight: 0, confidence: 1, evidence: ['Not applicable — user does not need sponsorship'] };
  }
  return calculateVisaCompatibility(features.user, features.job, features);
}
