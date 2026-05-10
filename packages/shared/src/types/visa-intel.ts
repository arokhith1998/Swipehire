/**
 * VisaIntel — the per-job visa intelligence payload returned alongside MatchResult
 * for users who need sponsorship.
 */

import { z } from 'zod';

export const visaIntelSchema = z.object({
  /** Resolved employer FEIN (if matched). */
  fein: z.string().nullable(),

  /** SOC code inferred for this job. */
  socCode: z.string().nullable(),

  /** Per-employer per-SOC counts from DOL data over the last 24 months. */
  stats24mo: z.object({
    totalLcas: z.number().int().min(0),
    certified: z.number().int().min(0),
    denied: z.number().int().min(0),
    withdrawn: z.number().int().min(0),
    medianWageOffered: z.number().nullable(),
    p25WageOffered: z.number().nullable(),
    p75WageOffered: z.number().nullable(),
    lastSponsoredAt: z.string().datetime().nullable(),
  }),

  /** Computed certification rate (certified / (certified + denied)) over 24 months. */
  certificationRate24mo: z.number().min(0).max(1).nullable(),

  /** Days since this employer last filed an LCA in this SOC. NULL if never. */
  daysSinceLastSponsored: z.number().int().min(0).nullable(),

  /** Safe-harbor: is the job's salary at or above the prevailing wage Level II for this SOC + metro? */
  salaryMeetsPrevailingWage: z.boolean().nullable(),

  /** Prevailing wage Level II for this SOC and metro. */
  prevailingWageLevelIi: z.number().nullable(),

  /** Per-status nuances. E.g. for STEM-OPT users: is employer E-Verify enrolled? */
  statusSpecific: z.record(z.string(), z.unknown()).optional(),

  /** Human-readable summary for UI. Always populated. */
  summary: z.string(),

  /** Warnings to surface prominently. */
  warnings: z.array(z.string()),

  /** Confidence in this intel (0-1). Lower when employer match was fuzzy. */
  confidence: z.number().min(0).max(1),
});

export type VisaIntel = z.infer<typeof visaIntelSchema>;
