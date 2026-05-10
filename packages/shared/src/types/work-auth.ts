/**
 * WorkAuth — richer model than v1's `visaStatus` enum.
 * Defined in docs/02_algorithm_v2.md §5.4.
 *
 * Stored in `app.users.work_auth_v2` JSONB.
 * Drives the visa compatibility scorer + the application form auto-fill.
 */

import { z } from 'zod';

export const WORK_AUTH_STATUSES = [
  'us_citizen',
  'green_card',
  'h1b',
  'h4_ead',
  'l1',
  'l2_ead',
  'opt',
  'stem_opt',
  'cpt',
  'e3',     // Australia
  'tn',     // Canada/Mexico
  'h1b1',   // Chile/Singapore
  'o1',
  'j1',
  'asylum_ead',
  'other',
] as const;

export type WorkAuthStatus = (typeof WORK_AUTH_STATUSES)[number];

export const workAuthSchema = z.object({
  status: z.enum(WORK_AUTH_STATUSES),

  /** When the current authorization expires (e.g. STEM-OPT EAD valid through). */
  expiresAt: z.string().datetime().optional(),

  /** Months until the user needs sponsorship. NULL = "doesn't apply / forever". */
  sponsorshipNeededWithinMonths: z.number().int().min(0).max(120).optional(),

  /** Used for E-3 (Australia), TN (Canada/Mexico), H1B1 (Chile/Singapore), O-1 (any). */
  citizenshipFor: z.string().optional(),

  /** Whether the user wants the system to auto-fill the "do you need sponsorship?" question. */
  autoFillVisaQuestion: z.boolean().default(true),

  /** Free-text additional context (e.g. "spouse on H-1B; H-4 EAD pending"). */
  notes: z.string().max(500).optional(),
});

export type WorkAuth = z.infer<typeof workAuthSchema>;

/**
 * Returns true if the user will need sponsorship for a US-based job.
 * Used by the visa compatibility scorer to decide whether to apply the layer.
 */
export function userNeedsSponsorship(workAuth: WorkAuth | null | undefined): boolean {
  if (!workAuth) return false;
  switch (workAuth.status) {
    case 'us_citizen':
    case 'green_card':
    case 'asylum_ead':
      return false;
    case 'h1b':
    case 'h4_ead':
    case 'l1':
    case 'l2_ead':
      // Already sponsored. May need transfer; treat as low-friction sponsorship need.
      return true;
    case 'opt':
    case 'stem_opt':
    case 'cpt':
    case 'f1' as any:
    case 'h1b1':
    case 'e3':
    case 'tn':
    case 'o1':
    case 'j1':
    case 'other':
      return true;
    default:
      return true;
  }
}

/**
 * Returns the canonical answer for "Will you require sponsorship now or in the future?"
 * Used by the application form auto-filler.
 */
export function sponsorshipAnswer(workAuth: WorkAuth | null | undefined): boolean {
  return userNeedsSponsorship(workAuth);
}

/**
 * Returns the canonical answer for "Are you currently authorized to work in the US?"
 */
export function authorizedToWorkAnswer(workAuth: WorkAuth | null | undefined): boolean {
  if (!workAuth) return false;
  // F-1 without EAD is not yet authorized for general work.
  if ((workAuth.status as string) === 'f1' && !workAuth.expiresAt) return false;
  return [
    'us_citizen', 'green_card', 'h1b', 'h4_ead', 'l1', 'l2_ead',
    'opt', 'stem_opt', 'cpt', 'e3', 'tn', 'h1b1', 'o1', 'j1', 'asylum_ead',
  ].includes(workAuth.status);
}
