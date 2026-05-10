/**
 * salaryFit — distance between user's expected salary and the offered band.
 * Confidence drops to 0 if either side is missing data (no penalty).
 */

import type { Subscore } from '@swipehire/shared';
import type { ExtractedFeatures } from '../featureExtractor.js';

export async function salaryFit(features: ExtractedFeatures): Promise<Subscore> {
  const { user, job } = features;
  const expected = parseSalary(user.expectedSalary);

  if (!expected || (job.salaryMin == null && job.salaryMax == null)) {
    return {
      value: 0.5, weight: 0, confidence: 0,
      evidence: ['Salary data missing — neutral score, no impact'],
    };
  }

  const min = job.salaryMin ?? job.salaryMax!;
  const max = job.salaryMax ?? job.salaryMin!;
  const mid = (min + max) / 2;

  if (expected >= min && expected <= max) {
    return { value: 1.0, weight: 0, confidence: 0.95,
      evidence: [`Expected $${(expected/1000).toFixed(0)}k within band $${(min/1000).toFixed(0)}k–$${(max/1000).toFixed(0)}k`] };
  }

  const drift = Math.abs(expected - mid) / mid;
  let value: number;
  if (drift <= 0.15) value = 0.75;
  else if (drift <= 0.30) value = 0.4;
  else value = 0.1;

  return {
    value, weight: 0, confidence: 0.85,
    evidence: [`Expected $${(expected/1000).toFixed(0)}k vs mid $${(mid/1000).toFixed(0)}k (${(drift*100).toFixed(0)}% drift)`],
  };
}

function parseSalary(s: string | null | undefined): number | null {
  if (!s) return null;
  // Match the largest number in the string (handles "$140k–$180k", "$150,000", etc.)
  const matches = s.match(/(\d+[\d,]*)\s*k?/gi);
  if (!matches) return null;
  const numbers = matches.map(m => {
    const isK = /k/i.test(m);
    const n = parseFloat(m.replace(/[,k]/gi, ''));
    return isK ? n * 1000 : n;
  });
  return Math.max(...numbers);
}
