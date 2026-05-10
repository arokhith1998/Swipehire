/**
 * locationFit — geo-aware match. Replaces v1's substring location match.
 *
 * Per docs/02_algorithm_v2.md §3.4. v2.1 will use OSM Nominatim for proper geocoding.
 */

import type { Subscore } from '@swipehire/shared';
import type { ExtractedFeatures } from '../featureExtractor.js';

export async function locationFit(features: ExtractedFeatures): Promise<Subscore> {
  const { job, user, jobMetro, userMetros } = features;

  // Remote / hybrid handling
  const userWantsRemote = user.remotePreference === 'remote';
  const userOkHybrid = user.remotePreference === 'remote' || user.remotePreference === 'hybrid';

  if (job.isRemote && userWantsRemote) {
    return {
      value: 1.0, weight: 0, confidence: 1.0,
      evidence: ['Job is remote and user prefers remote'],
    };
  }
  if (job.isHybrid && userOkHybrid && jobMetro && userMetros.includes(jobMetro)) {
    return {
      value: 0.85, weight: 0, confidence: 0.9,
      evidence: [`Job is hybrid in ${jobMetro}; user prefers ${user.remotePreference}`],
    };
  }

  if (!jobMetro || userMetros.length === 0) {
    return {
      value: 0.4, weight: 0, confidence: 0.4,
      evidence: ['Location data missing or unparseable'],
    };
  }

  if (userMetros.includes(jobMetro)) {
    return {
      value: 1.0, weight: 0, confidence: 0.95,
      evidence: [`Job metro "${jobMetro}" matches user preference`],
    };
  }
  // Different metro — fall back. v2.1 will geocode for state/country comparison.
  return {
    value: 0.2, weight: 0, confidence: 0.7,
    evidence: [`Job in "${jobMetro}", user prefers ${userMetros.join(', ')}`],
  };
}
