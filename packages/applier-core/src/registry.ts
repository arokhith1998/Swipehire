/**
 * Adapter registry — central lookup by ATS name.
 */

import type { AtsSpec } from './types.js';
import { greenhouseSpec } from './adapters/greenhouse.js';
import { leverSpec } from './adapters/lever.js';
import { ashbySpec } from './adapters/ashby.js';
import { genericSpec } from './adapters/generic.js';

export const ALL_SPECS: AtsSpec[] = [greenhouseSpec, leverSpec, ashbySpec, genericSpec];

const BY_ATS: Record<string, AtsSpec> = Object.fromEntries(
  ALL_SPECS.map(s => [s.ats, s])
);

export function getSpecForAts(ats: string | null | undefined): AtsSpec {
  if (!ats) return genericSpec;
  return BY_ATS[ats.toLowerCase()] ?? genericSpec;
}

/** Try to detect the right spec from URL alone — for ingest-time classification. */
export function detectSpecFromUrl(url: string): AtsSpec {
  const host = (() => {
    try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
  })();
  for (const spec of ALL_SPECS) {
    if (spec.ats !== 'custom' && spec.matches(url, host)) return spec;
  }
  return genericSpec;
}
