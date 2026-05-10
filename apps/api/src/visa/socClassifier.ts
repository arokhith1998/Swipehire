/**
 * Map a job (title + description) to a SOC code.
 *
 * v2.0: keyword + heuristic over a curated SOC seed (~30 codes initially).
 * v2.1: fine-tuned small transformer for ambiguous cases.
 */

import { db } from '@swipehire/db';
import { sql } from 'drizzle-orm';

interface SocMatch {
  code: string;
  confidence: number;
}

/** Manual title → SOC seed for the highest-confidence common cases. */
const TITLE_TO_SOC: Array<{ pattern: RegExp; soc: string; confidence: number }> = [
  // Marketing (Adhithya's targeting)
  { pattern: /\bmarketing manager\b/i, soc: '11-2021', confidence: 0.92 },
  { pattern: /\b(growth|performance|paid|brand|product) marketing\b/i, soc: '11-2021', confidence: 0.90 },
  { pattern: /\b(media buyer|paid media|paid search|paid social|sem|programmatic)\b/i, soc: '11-2021', confidence: 0.88 },
  { pattern: /\b(public relations|pr) (manager|specialist)\b/i, soc: '11-2032', confidence: 0.90 },
  { pattern: /\b(market research|research analyst)\b/i, soc: '13-1161', confidence: 0.88 },
  { pattern: /\bmarketing analyst\b/i, soc: '13-1161', confidence: 0.85 },

  // Product
  { pattern: /\b(senior |sr\.? |associate |group |principal )?product manager\b/i, soc: '11-3021', confidence: 0.88 },
  { pattern: /\bproduct analyst\b/i, soc: '13-1111', confidence: 0.80 },

  // Pricing
  { pattern: /\bpricing (manager|strategy|analyst)\b/i, soc: '13-2099', confidence: 0.85 },
  { pattern: /\brevenue (management|operations|analyst)\b/i, soc: '13-1111', confidence: 0.80 },

  // Software
  { pattern: /\b(software|backend|full[- ]stack|frontend) (engineer|developer)\b/i, soc: '15-1252', confidence: 0.92 },
  { pattern: /\b(data scientist|applied scientist)\b/i, soc: '15-2051', confidence: 0.90 },
  { pattern: /\b(machine learning|ml|ai) engineer\b/i, soc: '15-1252', confidence: 0.88 },
  { pattern: /\bdata engineer\b/i, soc: '15-1252', confidence: 0.88 },
];

/**
 * Classify a (title, description) pair to a SOC code.
 * Returns null if no confident match.
 */
export async function classifySoc(title: string, description: string): Promise<SocMatch | null> {
  const text = `${title}\n${description.slice(0, 2000)}`;
  const matches: SocMatch[] = [];
  for (const { pattern, soc, confidence } of TITLE_TO_SOC) {
    if (pattern.test(text)) matches.push({ code: soc, confidence });
  }
  if (matches.length === 0) return null;
  // Return the highest-confidence match
  matches.sort((a, b) => b.confidence - a.confidence);
  return matches[0];
}

/** Fast convenience for the matcher. Returns just the code or null. */
export async function inferSoc(title: string, description: string): Promise<string | null> {
  const m = await classifySoc(title, description);
  return m?.code ?? null;
}
