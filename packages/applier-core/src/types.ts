/**
 * Core types — environment-agnostic.
 *
 * The execution environment supplies a `Driver` with a small DOM-like surface.
 * Playwright wraps it as an async-locator driver; the extension wraps it as
 * a sync-querySelector driver.
 */

import { z } from 'zod';

/** What we know about a candidate from the user's profile, ready for form-fill. */
export const profileSchema = z.object({
  fullName: z.string(),
  email: z.string().email(),
  phone: z.string().optional(),
  location: z.string().optional(),
  linkedinUrl: z.string().url().optional(),
  githubUrl: z.string().url().optional(),
  portfolioUrl: z.string().url().optional(),
  workAuthorized: z.boolean(),
  requiresSponsorship: z.boolean(),
  visaStatus: z.string().optional(),
  yearsOfExperience: z.number().int().nonnegative().optional(),
  salaryExpectation: z.string().optional(),
  resumeFileUrl: z.string().url().optional(),
  resumeText: z.string().optional(),
  coverLetter: z.string().optional(),
  /** User's free-form answers to recurring questions, keyed by normalized question. */
  customAnswers: z.record(z.string(), z.string()).optional(),
});

export type Profile = z.infer<typeof profileSchema>;

/**
 * Field types the applier can fill.
 */
export type FieldKind =
  | 'text' | 'email' | 'phone' | 'url'
  | 'textarea'
  | 'select' | 'multiselect'
  | 'radio' | 'checkbox' | 'yesno'
  | 'file'
  | 'unknown';

/**
 * One field on a form. `value` is what we'd fill it with for the given profile.
 */
export interface FieldSpec {
  /** Stable key — the FieldMap lookup. */
  key: string;
  /** What kind of input. */
  kind: FieldKind;
  /** Human label as it appears on the form (used for fuzzy matching). */
  label: string | RegExp;
  /** Selectors to find the field, in priority order. */
  selectors: string[];
  /** Whether this is required to submit. Best-effort detection. */
  required?: boolean;
  /** For select/radio: the option label to choose, given a profile + question context. */
  optionResolver?: (profile: Profile, options: string[]) => string | null;
  /** For text/textarea: the value to fill. */
  valueResolver?: (profile: Profile) => string | undefined;
}

/** The per-ATS specification — selectors + answer mappings + submit policy. */
export interface AtsSpec {
  /** Unique key matching jobs.ats_type. */
  ats: string;
  /** Detect whether a given URL/page is from this ATS. */
  matches: (url: string, hostname: string) => boolean;
  /** The fields we know how to fill on a typical form for this ATS. */
  fields: FieldSpec[];
  /** Selector for the form submit button. */
  submitSelector: string;
  /** Selector that, when present, indicates a successful submission. */
  successSelector: string;
  /** Selector for a captcha or other "human required" element. */
  humanRequiredSelectors: string[];
  /** Tier classification for the per-ATS health metric. */
  tier: 1 | 2 | 3;
}

/**
 * What the applier produces when evaluating (not yet submitting) a form.
 * The extension overlay shows this to the user before submit.
 */
export interface FormPreview {
  ats: string;
  filledFields: Array<{ key: string; label: string; value: string; required: boolean }>;
  unfilledRequired: Array<{ key: string; label: string; reason: string }>;
  humanRequired: string[];   // captcha/etc — submission impossible without user
  resumeFilePresent: boolean;
}
