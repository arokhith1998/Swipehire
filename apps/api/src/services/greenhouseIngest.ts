/**
 * Greenhouse public-board ingester.
 *
 * For each org in GREENHOUSE_ORGS we fetch
 *   https://boards-api.greenhouse.io/v1/boards/{org}/jobs?content=true
 * and upsert each posting into the `jobs` table.
 *
 * Idempotency: we key on (company, externalUrl) since Greenhouse posting
 * IDs are stable within an org.
 *
 * No auth required — this is the public job board API.
 */

import { db, jobs as jobsTable } from '@swipehire/db';
import { sql, eq, and } from 'drizzle-orm';

/**
 * Confirmed-on-Greenhouse orgs (404-checked May 2026).
 *
 * Add new orgs to the bottom; the ingester logs and skips 404s gracefully
 * if a company moves to Lever/Ashby/etc.
 */
export const GREENHOUSE_ORGS = [
  'anthropic',
  'stripe',
  'vercel',
  'figma',
  'scaleai',
  'robinhood',
  'instacart',
  'mercury',
  'discord',
];

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location: { name: string };
  content: string;            // HTML-encoded
  company_name?: string;
  metadata?: Array<{ name: string; value: any; value_type: string }>;
  updated_at?: string;
  first_published?: string;
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
  meta?: { total: number };
}

export interface IngestResult {
  org: string;
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}

/**
 * Decode Greenhouse's `&` JSON unicode escapes (already decoded by JSON.parse)
 * plus the HTML entities they double-encode (`&lt;` etc.) and strip tags
 * down to plain text suitable for the `jobs.description` column.
 */
function htmlToText(html: string): string {
  if (!html) return '';
  const decoded = html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
  // Block tags → newline; everything else stripped.
  return decoded
    .replace(/<\/?(p|div|li|h[1-6]|br)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Heuristic: does this JD mention sponsorship? */
function jdMentionsSponsorship(text: string): boolean {
  const norm = text.toLowerCase();
  if (/\b(do not|don'?t|will not|cannot|can'?t)\s+(sponsor|provide.*sponsor)/i.test(norm)) return false;
  if (/\b(no visa sponsor|no sponsorship|not eligible for sponsor)/i.test(norm)) return false;
  return /\bvisa sponsor|sponsorship is available|sponsor work visa|h-?1b sponsor/i.test(norm);
}

/** Pull out a coarse skills list from the JD via the same keyword pass our matcher uses. */
function extractSkills(text: string): string[] {
  const COMMON = [
    'Python', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'Go', 'Rust', 'Java', 'Kotlin', 'Swift',
    'Ruby', 'C++', 'C#', 'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis',
    'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'Terraform',
    'Kafka', 'Airflow', 'Spark', 'Snowflake', 'dbt',
    'PyTorch', 'TensorFlow', 'CUDA', 'LLM', 'RAG',
    'Figma', 'Linear', 'Jira',
    'Tableau', 'Looker', 'Mixpanel', 'Amplitude', 'Segment',
    'GA4', 'Google Ads', 'Meta Ads', 'HubSpot', 'Salesforce', 'Marketo',
    'A/B Testing', 'SEO', 'SEM',
  ];
  const found = new Set<string>();
  for (const skill of COMMON) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Use a lookaround instead of \b since \b doesn't fire next to + or # (C++, C#).
    const re = new RegExp(`(?:^|[^A-Za-z0-9_])${escaped}(?=$|[^A-Za-z0-9_])`, 'i');
    if (re.test(text)) found.add(skill);
  }
  return Array.from(found);
}

/** Parse "Remote" / "Remote, US" / "San Francisco, CA" into {location, isRemote, isHybrid}. */
function classifyLocation(name: string, metadata: GreenhouseJob['metadata']): { location: string; isRemote: boolean; isHybrid: boolean } {
  const lcName = (name || '').toLowerCase();
  const isRemote = /\bremote\b/.test(lcName);
  const meta = (metadata ?? []).find(m => /location\s*type/i.test(m.name));
  const isHybrid = meta ? /hybrid/i.test(String(meta.value ?? '')) : /\bhybrid\b/.test(lcName);
  return { location: name || 'Unspecified', isRemote, isHybrid: isHybrid && !isRemote };
}

async function upsertJob(j: GreenhouseJob, org: string): Promise<'inserted' | 'updated' | 'skipped'> {
  const description = htmlToText(j.content);
  if (description.length < 100) return 'skipped'; // Garbage / placeholder posting
  const company = j.company_name || titleCase(org);
  const { location, isRemote, isHybrid } = classifyLocation(j.location?.name, j.metadata);
  const skills = extractSkills(description);
  const sponsorsVisa = jdMentionsSponsorship(description);

  const existing = await db
    .select({ id: jobsTable.id })
    .from(jobsTable)
    .where(and(eq(jobsTable.company, company), eq(jobsTable.externalUrl, j.absolute_url)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(jobsTable)
      .set({
        title: j.title,
        location,
        description,
        requirements: skills,
        isRemote,
        isHybrid,
        sponsorsVisa,
      })
      .where(eq(jobsTable.id, existing[0].id));
    return 'updated';
  }

  await db.insert(jobsTable).values({
    title: j.title,
    company,
    location,
    description,
    requirements: skills,
    isRemote,
    isHybrid,
    sponsorsVisa,
    externalUrl: j.absolute_url,
    type: 'full-time',
    createdAt: j.first_published ? new Date(j.first_published) : new Date(),
  });
  return 'inserted';
}

function titleCase(s: string): string {
  return s.split(/[-_]/).map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ');
}

export async function ingestOrg(org: string): Promise<IngestResult> {
  const result: IngestResult = { org, fetched: 0, inserted: 0, updated: 0, skipped: 0, errors: 0 };
  let data: GreenhouseResponse;
  try {
    const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${org}/jobs?content=true`, {
      headers: { 'User-Agent': 'SwipeHire/2.0 (+https://swipehire.io)' },
    });
    if (!r.ok) {
      console.warn(`[greenhouse] ${org}: HTTP ${r.status}`);
      result.errors = 1;
      return result;
    }
    data = await r.json() as GreenhouseResponse;
  } catch (err: any) {
    console.warn(`[greenhouse] ${org}: fetch failed —`, err.message);
    result.errors = 1;
    return result;
  }

  result.fetched = data.jobs?.length ?? 0;
  for (const job of data.jobs ?? []) {
    try {
      const outcome = await upsertJob(job, org);
      result[outcome]++;
    } catch (err: any) {
      result.errors++;
      console.warn(`[greenhouse] ${org} job ${job.id} failed —`, err.message);
    }
  }
  return result;
}

export async function ingestAllOrgs(orgs: string[] = GREENHOUSE_ORGS): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const org of orgs) {
    const start = Date.now();
    const r = await ingestOrg(org);
    const ms = Date.now() - start;
    console.log(`[greenhouse] ${org}: fetched=${r.fetched} +${r.inserted} ~${r.updated} skip=${r.skipped} err=${r.errors} (${ms}ms)`);
    results.push(r);
  }
  return results;
}
