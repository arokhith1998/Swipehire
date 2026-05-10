/**
 * locationFit — geo-aware match. Replaces v1's substring location match.
 *
 * Per docs/02_algorithm_v2.md §3.4. v2.1 will use OSM Nominatim for proper geocoding.
 *
 * Supports:
 *   - Multi-metro user prefs ("SF Bay Area | NYC Metro")
 *   - Multi-mode work prefs ("remote,hybrid")
 *   - "Anywhere in US" wildcard
 */

import type { Subscore } from '@swipehire/shared';
import type { ExtractedFeatures } from '../featureExtractor.js';

/** Parse a comma/pipe-separated remotePreference into a Set of accepted modes. */
function parseModes(rp: string | null | undefined): Set<string> {
  if (!rp) return new Set();
  return new Set(rp.split(/[,|;]+/).map(s => s.trim().toLowerCase()).filter(Boolean));
}

/** Determine the job's mode from its flags. */
function jobMode(features: ExtractedFeatures): 'remote' | 'hybrid' | 'onsite' {
  if (features.job.isRemote) return 'remote';
  if (features.job.isHybrid) return 'hybrid';
  return 'onsite';
}

export async function locationFit(features: ExtractedFeatures): Promise<Subscore> {
  const { job, user, jobMetro, userMetros } = features;

  const userModes = parseModes(user.remotePreference);
  const mode = jobMode(features);
  const modeAccepted = userModes.size === 0 || userModes.has(mode);

  // Remote acceptance: user explicitly opted into remote.
  if (mode === 'remote' && userModes.has('remote')) {
    return {
      value: 1.0, weight: 0, confidence: 1.0,
      evidence: ['Remote role and user accepts remote'],
    };
  }

  // "Anywhere in US" wildcard — accept any US-based job.
  if (userMetros.includes('Anywhere in US') && jobMetro && jobMetro !== 'Remote') {
    if (modeAccepted) {
      return {
        value: 1.0, weight: 0, confidence: 0.85,
        evidence: [`User open to anywhere in US; job in ${jobMetro}`],
      };
    }
    return {
      value: 0.5, weight: 0, confidence: 0.85,
      evidence: [`Location OK (anywhere in US) but mode "${mode}" not in user's accepted ${Array.from(userModes).join('/') || 'none'}`],
    };
  }

  // Hybrid + same metro + user accepts hybrid.
  if (mode === 'hybrid' && jobMetro && userMetros.includes(jobMetro) && (userModes.has('hybrid') || userModes.size === 0)) {
    return {
      value: 0.92, weight: 0, confidence: 0.9,
      evidence: [`Hybrid in ${jobMetro}; user accepts hybrid`],
    };
  }

  if (!jobMetro || userMetros.length === 0) {
    return {
      value: 0.4, weight: 0, confidence: 0.4,
      evidence: ['Location data missing or unparseable'],
    };
  }

  // User's metro set includes the job metro.
  if (userMetros.includes(jobMetro)) {
    if (modeAccepted) {
      return {
        value: 1.0, weight: 0, confidence: 0.95,
        evidence: [`Job in ${jobMetro}; matches user preference (${userMetros.join(', ')})`],
      };
    }
    return {
      value: 0.6, weight: 0, confidence: 0.85,
      evidence: [`Right metro (${jobMetro}) but mode "${mode}" not in user's accepted ${Array.from(userModes).join('/') || 'none'}`],
    };
  }

  // Different metro entirely.
  return {
    value: 0.2, weight: 0, confidence: 0.7,
    evidence: [`Job in "${jobMetro}", user prefers ${userMetros.join(', ')}`],
  };
}
