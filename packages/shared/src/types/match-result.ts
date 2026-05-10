/**
 * MatchResult — the single contract every UI and recruiter dashboard consumes.
 * Defined in docs/02_algorithm_v2.md §1.
 *
 * Hard rule: if `label === 'Insufficient data'`, `interviewProbability` MUST be null.
 * UI never displays a numeric score for insufficient data results.
 */

import { z } from 'zod';

export const MATCH_LABELS = [
  'Strong fit',          // p ≥ 0.70 AND CI width ≤ 0.20
  'Promising fit',       // p ≥ 0.55 AND CI width ≤ 0.30
  'Stretch',             // p ≥ 0.35 OR CI overlaps the threshold
  'Weak fit',            // p <  0.35 with reasonable CI
  'Insufficient data',   // CI width > 0.40 — show but don't claim
] as const;

export type MatchLabel = (typeof MATCH_LABELS)[number];

export const SUBSCORE_KEYS = [
  'skillsSemantic',
  'titleAlignment',
  'seniorityFit',
  'locationFit',
  'domainExperience',
  'visaCompatibility',
  'salaryFit',
  'recencySignal',
] as const;

export type SubscoreKey = (typeof SUBSCORE_KEYS)[number];

export const subscoreSchema = z.object({
  value: z.number().min(0).max(1),
  weight: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()).optional(),
});

export type Subscore = z.infer<typeof subscoreSchema>;

export const ghostJobRiskValues = ['low', 'medium', 'high', 'unknown'] as const;
export type GhostJobRisk = (typeof ghostJobRiskValues)[number];

export const jobAuthenticitySchema = z.object({
  livenessProbability: z.number().min(0).max(1),
  ghostJobRisk: z.enum(ghostJobRiskValues),
  signalsObserved: z.array(z.string()),
  lastVerifiedAt: z.string().datetime().nullable(),
});

export type JobAuthenticity = z.infer<typeof jobAuthenticitySchema>;

export const explainSchema = z.object({
  topReasonsToApply: z.array(z.string()).max(3),
  topReasonsToHesitate: z.array(z.string()).max(3),
  missingEvidence: z.array(z.string()),
  modelVersion: z.string(),
  scoredAt: z.string().datetime(),
});

export type Explain = z.infer<typeof explainSchema>;

export const matchResultSchema = z.object({
  /** Calibrated probability of getting an interview if the user applies. Null when label = 'Insufficient data'. */
  interviewProbability: z.number().min(0).max(1).nullable(),

  /** 90% confidence interval. Null when label = 'Insufficient data'. */
  confidenceInterval: z.tuple([z.number(), z.number()]).nullable(),

  /** Human-facing label, derived from probability AND CI width. */
  label: z.enum(MATCH_LABELS),

  /** Decomposed sub-scores. All present even when label = 'Insufficient data'. */
  subscores: z.record(z.enum(SUBSCORE_KEYS), subscoreSchema),

  /** Authenticity layer — independent of fit. */
  jobAuthenticity: jobAuthenticitySchema,

  /** Visa intelligence — only populated if user needs sponsorship. */
  visaIntel: z.unknown().optional(),

  /** Provenance for trust and debugging. */
  explain: explainSchema,
});

export type MatchResult = z.infer<typeof matchResultSchema>;
