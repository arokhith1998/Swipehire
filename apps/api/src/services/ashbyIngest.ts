/**
 * Ashby public-API ingester.
 *
 * Endpoint: https://api.ashbyhq.com/posting-api/job-board/{slug}
 * Public, no key required. Returns { jobs: [...] } with rich fields.
 */

import { db, jobs as jobsTable } from '@swipehire/db';
import { eq, and } from 'drizzle-orm';
import type { IngestResult } from './leverIngest.js';

interface AshbyJob {
  id: string;
  title: string;
  department?: string;
  team?: string;
  employmentType?: string;
  location?: string;
  publishedAt?: string;
  isRemote?: boolean;
  workplaceType?: string;          // "Hybrid" | "OnSite" | "Remote"
  jobUrl: string;
  applyUrl?: string;
  descriptionHtml?: string;
}

interface AshbyResponse {
  jobs?: AshbyJob[];
  apiVersion?: string;
}

const SKILLS = [
  'Python', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'Go', 'Rust', 'Java',
  'Ruby', 'C++', 'C#', 'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis',
  'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'Terraform',
  'Kafka', 'Airflow', 'Spark', 'Snowflake', 'dbt',
  'PyTorch', 'TensorFlow', 'CUDA', 'LLM', 'RAG',
  'Figma', 'Linear', 'Jira', 'Tableau', 'Looker', 'Mixpanel', 'Amplitude',
  'GA4', 'Google Ads', 'Meta Ads', 'HubSpot', 'Salesforce', 'A/B Testing', 'SEO',
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function extractSkills(text: string): string[] {
  const found = new Set<string>();
  for (const s of SKILLS) {
    const re = new RegExp(`(?:^|[^A-Za-z0-9_])${escapeRegex(s)}(?=$|[^A-Za-z0-9_])`, 'i');
    if (re.test(text)) found.add(s);
  }
  return Array.from(found);
}
function jdMentionsSponsorship(text: string): boolean {
  const t = text.toLowerCase();
  if (/\b(do not|don'?t|will not|cannot|can'?t)\s+(sponsor|provide.*sponsor)/i.test(t)) return false;
  if (/\b(no visa sponsor|no sponsorship|not eligible for sponsor)/i.test(t)) return false;
  return /\bvisa sponsor|sponsorship is available|sponsor work visa|h-?1b sponsor/i.test(t);
}

function htmlToText(html: string): string {
  if (!html) return '';
  return html
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/<\/?(p|div|li|h[1-6]|br)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function classifyAshby(j: AshbyJob): { isRemote: boolean; isHybrid: boolean } {
  const wp = (j.workplaceType ?? '').toLowerCase();
  const isRemote = wp === 'remote' || j.isRemote === true || /\bremote\b/i.test(j.location ?? '');
  const isHybrid = wp === 'hybrid' && !isRemote;
  return { isRemote, isHybrid };
}

async function upsertJob(j: AshbyJob, company: string): Promise<'inserted' | 'updated' | 'skipped'> {
  const description = htmlToText(j.descriptionHtml ?? '');
  if (description.length < 100) return 'skipped';
  const { isRemote, isHybrid } = classifyAshby(j);
  const skills = extractSkills(description);
  const sponsorsVisa = jdMentionsSponsorship(description);

  const existing = await db.select({ id: jobsTable.id }).from(jobsTable)
    .where(and(eq(jobsTable.company, company), eq(jobsTable.externalUrl, j.jobUrl)))
    .limit(1);

  if (existing.length > 0) {
    await db.update(jobsTable).set({
      title: j.title,
      location: j.location ?? 'Unspecified',
      description,
      requirements: skills,
      isRemote,
      isHybrid,
      sponsorsVisa,
    }).where(eq(jobsTable.id, existing[0].id));
    return 'updated';
  }

  await db.insert(jobsTable).values({
    title: j.title,
    company,
    location: j.location ?? 'Unspecified',
    description,
    requirements: skills,
    isRemote,
    isHybrid,
    sponsorsVisa,
    externalUrl: j.jobUrl,
    type: mapEmploymentType(j.employmentType),
    createdAt: j.publishedAt ? new Date(j.publishedAt) : new Date(),
  });
  return 'inserted';
}

function mapEmploymentType(t?: string): string {
  if (!t) return 'full-time';
  const lc = t.toLowerCase();
  if (lc.includes('full')) return 'full-time';
  if (lc.includes('part')) return 'part-time';
  if (lc.includes('contract')) return 'contract';
  if (lc.includes('intern')) return 'intern';
  return 'full-time';
}

export async function ingestAshbyOrg(slug: string, displayName?: string): Promise<IngestResult> {
  const company = displayName ?? toTitleCase(slug);
  const result: IngestResult = { org: slug, ats: 'ashby', fetched: 0, inserted: 0, updated: 0, skipped: 0, errors: 0 };
  let jobs: AshbyJob[];
  try {
    const r = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, {
      headers: { 'User-Agent': 'SwipeHire/2.0 (+https://swipehire.io)' },
    });
    if (!r.ok) { result.errors = 1; return result; }
    const data = await r.json() as AshbyResponse;
    jobs = data.jobs ?? [];
  } catch {
    result.errors = 1;
    return result;
  }

  result.fetched = jobs.length;
  for (const j of jobs) {
    try {
      const outcome = await upsertJob(j, company);
      result[outcome]++;
    } catch {
      result.errors++;
    }
  }
  return result;
}

function toTitleCase(s: string): string {
  return s.split(/[-_]/).map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ');
}
