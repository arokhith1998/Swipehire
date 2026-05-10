/**
 * Feature extraction — gather everything the subscores need in one pass.
 * Avoids N+1 DB hits later in the pipeline.
 *
 * Heavy lookups (employer FEIN, visa stats, embeddings) happen here once.
 */

import type { ScoringUser, ScoringJob } from './matcher.js';
import type { WorkAuth } from '@swipehire/shared';

export interface ExtractedFeatures {
  user: ScoringUser;
  job: ScoringJob;

  // Resolved + normalized
  workAuth: WorkAuth | null;
  needsSponsorship: boolean;
  userTargetSocs: string[];
  userTargetRoleFamilies: string[];
  jobSocCode: string | null;
  jobRoleFamily: string | null;
  roleFamilyId: number | null;
  jobMetro: string | null;
  userMetros: string[];

  // Pre-computed for subscores
  resumeText: string;
  jdText: string;
  parsedRequirements: string[];
  userSkillsCanonical: string[];
  jdSkillsCanonical: string[];

  // Visa pre-resolution (when applicable)
  employerFein: string | null;

  // Recency
  daysSincePosted: number | null;
}

/**
 * Single extraction pass. Cached per (user.id, job.id, model_version).
 */
export async function extractFeatures(user: ScoringUser, job: ScoringJob): Promise<ExtractedFeatures> {
  // TODO(v2.1): wire to packages/db lookups for taxonomy + visa pre-resolution.
  // This stub returns a complete shape so subscores can be implemented and tested
  // before the full DB integration lands.

  const workAuth: WorkAuth | null = user.workAuthV2 ?? null;
  const needsSponsorship = !!workAuth && !['us_citizen', 'green_card', 'asylum_ead'].includes(workAuth.status);

  const resumeText = user.originalResumeContent ?? JSON.stringify(user.resumeData ?? {});
  const jdText = `${job.title}\n\n${job.description}\n\n${(job.requirements ?? []).join('\n')}`;

  return {
    user,
    job,
    workAuth,
    needsSponsorship,
    userTargetSocs: user.targetSocs ?? [],
    userTargetRoleFamilies: user.targetRoleFamilies ?? [],
    jobSocCode: job.socCode ?? null,
    jobRoleFamily: null, // resolved via roleFamilyId join in v2.1
    roleFamilyId: job.roleFamilyId ?? null,
    jobMetro: extractMetro(job.location),
    userMetros: user.preferredLocation ? [extractMetro(user.preferredLocation) ?? user.preferredLocation] : [],
    resumeText,
    jdText,
    parsedRequirements: job.requirements ?? [],
    userSkillsCanonical: user.skills ?? [], // TODO: normalize via skill_taxonomy
    jdSkillsCanonical: extractSkillsFromJd(jdText), // TODO: NER + taxonomy lookup
    employerFein: null, // resolved by visa.employerMatcher when needed
    daysSincePosted: job.createdAt ? daysBetween(job.createdAt, new Date()) : null,
  };
}

/** Naive metro extraction — replace with proper geocoding (OSM Nominatim) in v2.1. */
function extractMetro(location: string): string | null {
  if (!location) return null;
  const norm = location.toLowerCase().trim();
  // Quick win for common patterns
  if (norm.includes('san francisco') || norm.includes('bay area') || norm.includes('sf,')) return 'SF Bay Area';
  if (norm.includes('new york') || norm.includes('nyc') || norm.includes('manhattan')) return 'NYC Metro';
  if (norm.includes('los angeles') || norm.includes('la,')) return 'LA Metro';
  if (norm.includes('seattle')) return 'Seattle Metro';
  if (norm.includes('austin')) return 'Austin Metro';
  if (norm.includes('boston')) return 'Boston Metro';
  if (norm.includes('chicago')) return 'Chicago Metro';
  if (norm.includes('remote') || norm.includes('anywhere')) return 'Remote';
  return location;
}

/** Stub — v2.1 calls ML sidecar /extract-skills with the JD text. */
function extractSkillsFromJd(jdText: string): string[] {
  // Naive keyword scan as bootstrap. Replace with NER pipeline.
  const COMMON_SKILLS = [
    'Python', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'Go', 'SQL', 'AWS',
    'Google Analytics', 'GA4', 'Google Ads', 'Meta Ads', 'HubSpot', 'Marketo', 'Salesforce',
    'Mixpanel', 'Amplitude', 'Segment', 'Tableau', 'Looker', 'A/B Testing', 'SEO', 'SEM',
    'Figma', 'Jira', 'Linear', 'PostgreSQL', 'Kafka', 'Docker', 'Kubernetes',
  ];
  const found = new Set<string>();
  for (const skill of COMMON_SKILLS) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[^A-Za-z0-9_])${escaped}(?=$|[^A-Za-z0-9_])`, 'i');
    if (re.test(jdText)) found.add(skill);
  }
  return Array.from(found);
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
