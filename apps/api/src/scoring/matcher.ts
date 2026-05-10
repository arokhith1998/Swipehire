/**
 * SwipeHire v2 matcher — the public entry point for scoring.
 *
 * Replaces v1 src/services/jobMatcher.ts (substring matching + 50/30/20 weights).
 * v1 is kept available behind the feature flag USE_V2_MATCHER=false.
 *
 * See docs/02_algorithm_v2.md and docs/03_architecture.md §8.
 */

import type { MatchResult, Subscore, SubscoreKey } from '@swipehire/shared';
import { extractFeatures, type ExtractedFeatures } from './featureExtractor.js';
import { combine } from './combiner.js';
import { calibrate } from './calibrator.js';
import { buildExplain } from './explain.js';
import { computeAuthenticity } from '../authenticity/index.js';
import { fetchVisaIntel } from '../visa/compatibility.js';

import { skillsSemantic } from './subscores/skillsSemantic.js';
import { titleAlignment } from './subscores/titleAlignment.js';
import { seniorityFit } from './subscores/seniorityFit.js';
import { locationFit } from './subscores/locationFit.js';
import { domainExperience } from './subscores/domainExperience.js';
import { visaCompatibility } from './subscores/visaCompatibility.js';
import { salaryFit } from './subscores/salaryFit.js';
import { recencySignal } from './subscores/recencySignal.js';

/** Minimal user shape the matcher needs. Resolved by featureExtractor. */
export interface ScoringUser {
  id: number;
  workAuthV2?: any;
  targetSocs?: string[];
  targetRoleFamilies?: string[];
  preferredLocation?: string;
  remotePreference?: 'remote' | 'hybrid' | 'onsite' | null;
  expectedSalary?: string | null;
  experience?: string | null;
  skills?: string[];
  resumeData?: any;
  originalResumeContent?: string | null;
  cipCode?: string | null;
}

/** Minimal job shape the matcher needs. */
export interface ScoringJob {
  id: number;
  title: string;
  company: string;
  description: string;
  requirements?: string[];
  location: string;
  isRemote?: boolean;
  isHybrid?: boolean;
  socCode?: string | null;
  roleFamilyId?: number | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  sponsorsVisa?: boolean;
  createdAt?: Date | null;
  ats_type?: string | null;
  raw_match_features?: any;
}

const SUBSCORE_FUNCTIONS: Record<SubscoreKey, (f: ExtractedFeatures) => Promise<Subscore>> = {
  skillsSemantic,
  titleAlignment,
  seniorityFit,
  locationFit,
  domainExperience,
  visaCompatibility,
  salaryFit,
  recencySignal,
};

export interface ScoreOptions {
  /** Skip the authenticity check (e.g. when scoring a recruiter-posted job). */
  skipAuthenticity?: boolean;
  /** Skip visa intel (e.g. when user is a US citizen). */
  skipVisaIntel?: boolean;
  /** Override model version for A/B tests. */
  modelVersion?: string;
}

/**
 * Score a single (user, job) pair. Returns a complete MatchResult.
 * Latency target: < 200ms per pair when warm.
 */
export async function scoreJobForUser(
  user: ScoringUser,
  job: ScoringJob,
  options: ScoreOptions = {}
): Promise<MatchResult> {
  const t0 = performance.now();

  // 1. Feature extraction — single pass over both inputs.
  const features = await extractFeatures(user, job);

  // 2. Compute subscores in parallel.
  const subscoreEntries = await Promise.all(
    (Object.keys(SUBSCORE_FUNCTIONS) as SubscoreKey[]).map(async key => {
      const sub = await SUBSCORE_FUNCTIONS[key](features);
      return [key, sub] as const;
    })
  );
  const subscores = Object.fromEntries(subscoreEntries) as Record<SubscoreKey, Subscore>;

  // 3. Combine into raw score with role-family-conditional weights.
  const { raw, weights } = combine(subscores, features.roleFamilyId);
  // Apply weights back to subscores for transparency
  for (const key of Object.keys(weights) as SubscoreKey[]) {
    subscores[key].weight = weights[key];
  }

  // 4. Calibrate raw → probability with confidence interval.
  // Returns { interviewProbability, ciLow, ciHigh, label, modelVersion }.
  const calibration = await calibrate({
    raw,
    subscores,
    roleFamilyId: features.roleFamilyId,
    modelVersionOverride: options.modelVersion,
  });

  // 5. Authenticity (independent of fit).
  const jobAuthenticity = options.skipAuthenticity
    ? defaultAuthenticity()
    : await computeAuthenticity(job);

  // 6. Visa intel (only if user needs sponsorship).
  const visaIntel = options.skipVisaIntel
    ? undefined
    : await fetchVisaIntel(user, job, features);

  // 7. Build explain block.
  const explain = buildExplain({
    user,
    job,
    features,
    subscores,
    calibration,
    visaIntel,
    durationMs: Math.round(performance.now() - t0),
  });

  return {
    interviewProbability: calibration.interviewProbability,
    confidenceInterval: calibration.confidenceInterval,
    label: calibration.label,
    subscores,
    jobAuthenticity,
    visaIntel,
    explain,
  };
}

/**
 * Batch scoring — preferred for feeds. Single calibration round-trip.
 * Returns scores in the same order as the input jobs.
 */
export async function scoreFeedForUser(
  user: ScoringUser,
  jobs: ScoringJob[],
  options: ScoreOptions = {}
): Promise<MatchResult[]> {
  // For now: parallel single-job scoring. Phase 2: batch the calibration call.
  return Promise.all(jobs.map(job => scoreJobForUser(user, job, options)));
}

function defaultAuthenticity() {
  return {
    livenessProbability: 1.0,
    ghostJobRisk: 'low' as const,
    signalsObserved: ['recruiter-posted (skipped check)'],
    lastVerifiedAt: new Date().toISOString(),
  };
}
