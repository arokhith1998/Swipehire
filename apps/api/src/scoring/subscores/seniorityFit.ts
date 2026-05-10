/**
 * seniorityFit — asymmetric distance between user's level and JD's level.
 * Underqualified penalized harder than overqualified.
 */

import type { Subscore } from '@swipehire/shared';
import type { ExtractedFeatures } from '../featureExtractor.js';

const LEVELS = ['intern', 'entry', 'junior', 'mid', 'senior', 'staff', 'principal', 'director'] as const;
type Level = typeof LEVELS[number];

export async function seniorityFit(features: ExtractedFeatures): Promise<Subscore> {
  const { user, job } = features;

  const userLevel = inferLevel(user.experience ?? '');
  const jobLevel = inferLevel(`${job.title} ${job.description.slice(0, 500)}`);

  if (!userLevel || !jobLevel) {
    return {
      value: 0.5,
      weight: 0,
      confidence: 0.3,
      evidence: ['Could not infer seniority for user or job'],
    };
  }

  const userIdx = LEVELS.indexOf(userLevel);
  const jobIdx = LEVELS.indexOf(jobLevel);
  const diff = userIdx - jobIdx;

  // Asymmetric: positive diff = overqualified (mild penalty), negative = underqualified (sharper)
  let value: number;
  if (diff === 0) value = 1.0;
  else if (diff === 1) value = 0.85;       // slightly overqualified
  else if (diff === 2) value = 0.6;
  else if (diff === -1) value = 0.7;       // slightly underqualified
  else if (diff === -2) value = 0.4;
  else value = 0.1;

  return {
    value,
    weight: 0,
    confidence: 0.7,
    evidence: [`User level "${userLevel}" vs job level "${jobLevel}" (Δ${diff >= 0 ? '+' : ''}${diff})`],
  };
}

function inferLevel(text: string): Level | null {
  const t = text.toLowerCase();
  // Order matters — match more specific first
  if (/\bdirector\b|\bvp\b|\bvice president\b/i.test(t)) return 'director';
  if (/\bprincipal\b|\bdistinguished\b/i.test(t)) return 'principal';
  if (/\bstaff\b/i.test(t)) return 'staff';
  if (/\bsenior\b|\bsr\.?\b|\blead\b/i.test(t)) return 'senior';
  if (/\bjunior\b|\bjr\.?\b|\bassociate\b|\b(grad|graduate)\b/i.test(t)) return 'junior';
  if (/\bentry[- ]level\b|\bnew grad\b/i.test(t)) return 'entry';
  if (/\bintern(ship)?\b/i.test(t)) return 'intern';
  if (/\bmid[- ]level\b|\b(2|3|4|5) ?\+? years?\b/i.test(t)) return 'mid';
  return null;
}
