/**
 * Lever public-API ingester. Mirrors greenhouseIngest.ts shape.
 *
 * Endpoint: https://api.lever.co/v0/postings/{site}?mode=json&limit=200
 * Public, no key required.
 */

import { db, jobs as jobsTable } from '@swipehire/db';
import { sql, eq, and } from 'drizzle-orm';

interface LeverPosting {
  id: string;
  text: string;                          // job title
  hostedUrl: string;
  applyUrl: string;
  categories?: {
    commitment?: string;                 // "Full-time", "Contract", etc.
    location?: string;
    team?: string;
    department?: string;
  };
  workplaceType?: string;                // "remote" | "hybrid" | "on-site"
  description?: string;                  // plain text
  descriptionPlain?: string;
  lists?: Array<{ text: string; content: string }>;     // bulleted sections
  createdAt?: number;                    // millis
}

export interface IngestResult {
  org: string;
  ats: 'lever' | 'greenhouse' | 'ashby';
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
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

function classifyLocation(p: LeverPosting): { location: string; isRemote: boolean; isHybrid: boolean } {
  const loc = p.categories?.location ?? 'Unspecified';
  const wp = (p.workplaceType ?? '').toLowerCase();
  const isRemote = wp === 'remote' || /\bremote\b/i.test(loc);
  const isHybrid = wp === 'hybrid' && !isRemote;
  return { location: loc, isRemote, isHybrid };
}

function buildDescription(p: LeverPosting): string {
  const parts: string[] = [];
  if (p.descriptionPlain) parts.push(p.descriptionPlain);
  else if (p.description) parts.push(p.description.replace(/<[^>]+>/g, ''));
  for (const list of p.lists ?? []) {
    parts.push(`\n${list.text}\n${list.content.replace(/<[^>]+>/g, '')}`);
  }
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function upsertJob(p: LeverPosting, company: string): Promise<'inserted' | 'updated' | 'skipped'> {
  const description = buildDescription(p);
  if (description.length < 100) return 'skipped';
  const { location, isRemote, isHybrid } = classifyLocation(p);
  const skills = extractSkills(description);
  const sponsorsVisa = jdMentionsSponsorship(description);

  const existing = await db.select({ id: jobsTable.id }).from(jobsTable)
    .where(and(eq(jobsTable.company, company), eq(jobsTable.externalUrl, p.hostedUrl)))
    .limit(1);

  if (existing.length > 0) {
    await db.update(jobsTable).set({
      title: p.text,
      location,
      description,
      requirements: skills,
      isRemote,
      isHybrid,
      sponsorsVisa,
    }).where(eq(jobsTable.id, existing[0].id));
    return 'updated';
  }

  await db.insert(jobsTable).values({
    title: p.text,
    company,
    location,
    description,
    requirements: skills,
    isRemote,
    isHybrid,
    sponsorsVisa,
    externalUrl: p.hostedUrl,
    type: (p.categories?.commitment ?? 'full-time').toLowerCase().replace(/\s+/g, '-'),
    createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
  });
  return 'inserted';
}

export async function ingestLeverOrg(slug: string, displayName?: string): Promise<IngestResult> {
  const company = displayName ?? toTitleCase(slug);
  const result: IngestResult = { org: slug, ats: 'lever', fetched: 0, inserted: 0, updated: 0, skipped: 0, errors: 0 };
  let postings: LeverPosting[];
  try {
    const r = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json&limit=200`, {
      headers: { 'User-Agent': 'SwipeHire/2.0 (+https://swipehire.io)' },
    });
    if (!r.ok) {
      result.errors = 1;
      return result;
    }
    const data = await r.json() as any;
    if (!Array.isArray(data)) {
      // Lever returns {ok:false, error:...} for unknown orgs
      return result;
    }
    postings = data;
  } catch {
    result.errors = 1;
    return result;
  }

  result.fetched = postings.length;
  for (const p of postings) {
    try {
      const outcome = await upsertJob(p, company);
      result[outcome]++;
    } catch (err: any) {
      result.errors++;
    }
  }
  return result;
}

function toTitleCase(s: string): string {
  return s.split(/[-_]/).map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ');
}
