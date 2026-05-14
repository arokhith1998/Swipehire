/**
 * Workday public-API ingester.
 *
 * Workday URL pattern (varies per tenant):
 *   https://{host}/wday/cxs/{tenant}/{site}/jobs       — list (POST, paginated)
 *   https://{host}/wday/cxs/{tenant}/{site}/job/{id}   — detail (GET)
 *
 * Public, no auth, but rate-limited per tenant (we cap at ~2 req/sec).
 *
 * Each registry entry needs:
 *   { ats: 'workday', host, tenant, site, slug? }
 *
 * Where:
 *   host   = e.g. 'nvidia.wd5.myworkdayjobs.com'
 *   tenant = e.g. 'nvidia'
 *   site   = e.g. 'NVIDIAExternalCareerSite'   (Workday calls this the "search session")
 */

import { db, jobs as jobsTable } from '@swipehire/db';
import { eq, and } from 'drizzle-orm';
import type { IngestResult } from './leverIngest.js';

interface WorkdayPosting {
  title: string;
  externalPath: string;        // relative path; full URL = https://{host}{externalPath}
  locationsText?: string;
  postedOn?: string;            // "Posted Today", "Posted 5 Days Ago", etc.
  bulletFields?: string[];      // first item is usually the requisition ID
}

interface WorkdayListResponse {
  total?: number;
  jobPostings?: WorkdayPosting[];
}

interface WorkdayJobDetail {
  jobPostingInfo?: {
    title?: string;
    jobDescription?: string;       // HTML
    location?: string;
    additionalLocations?: string[];
    timeType?: string;             // "Full time" / "Part time"
    remoteType?: string;            // "Remote", "Hybrid", "On-Site"
    externalUrl?: string;
    postedOn?: string;
    startDate?: string;
  };
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

function classifyLocation(loc: string, remoteType?: string): { isRemote: boolean; isHybrid: boolean } {
  const r = (remoteType ?? '').toLowerCase();
  if (r.includes('remote') || /\bremote\b/i.test(loc)) return { isRemote: true, isHybrid: false };
  if (r.includes('hybrid')) return { isRemote: false, isHybrid: true };
  return { isRemote: false, isHybrid: false };
}

interface WorkdayConfig {
  host: string;
  tenant: string;
  site: string;
}

async function fetchPage(cfg: WorkdayConfig, offset: number, limit: number): Promise<WorkdayListResponse | null> {
  try {
    const r = await fetch(`https://${cfg.host}/wday/cxs/${cfg.tenant}/${cfg.site}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'SwipeHire/2.0 (+https://swipehire.io)',
      },
      body: JSON.stringify({ appliedFacets: {}, limit, offset, searchText: '' }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    return await r.json() as WorkdayListResponse;
  } catch {
    return null;
  }
}

async function fetchJobDetail(cfg: WorkdayConfig, externalPath: string): Promise<WorkdayJobDetail | null> {
  try {
    // The detail endpoint mirrors externalPath: /wday/cxs/{tenant}/{site}/job/{id}
    const url = `https://${cfg.host}/wday/cxs/${cfg.tenant}/${cfg.site}${externalPath}`;
    const r = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SwipeHire/2.0 (+https://swipehire.io)',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    return await r.json() as WorkdayJobDetail;
  } catch {
    return null;
  }
}

async function upsertJob(p: WorkdayPosting, detail: WorkdayJobDetail | null, cfg: WorkdayConfig, company: string): Promise<'inserted' | 'updated' | 'skipped'> {
  const info = detail?.jobPostingInfo;
  const description = info?.jobDescription ? htmlToText(info.jobDescription) : '';
  if (description.length < 100) return 'skipped';

  const externalUrl = info?.externalUrl ?? `https://${cfg.host}${p.externalPath}`;
  const location = info?.location ?? p.locationsText ?? 'Unspecified';
  const { isRemote, isHybrid } = classifyLocation(location, info?.remoteType);
  const skills = extractSkills(description);
  const sponsorsVisa = jdMentionsSponsorship(description);
  const type = (info?.timeType ?? 'Full time').toLowerCase().includes('full') ? 'full-time'
            : (info?.timeType ?? '').toLowerCase().includes('part') ? 'part-time' : 'full-time';

  const existing = await db.select({ id: jobsTable.id }).from(jobsTable)
    .where(and(eq(jobsTable.company, company), eq(jobsTable.externalUrl, externalUrl)))
    .limit(1);

  if (existing.length > 0) {
    await db.update(jobsTable).set({
      title: p.title,
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
    title: p.title,
    company,
    location,
    description,
    requirements: skills,
    isRemote,
    isHybrid,
    sponsorsVisa,
    externalUrl,
    type,
    createdAt: parseWorkdayDate(info?.postedOn ?? p.postedOn) ?? new Date(),
  });
  return 'inserted';
}

function parseWorkdayDate(s?: string): Date | null {
  if (!s) return null;
  // "Posted Today" / "Posted Yesterday" / "Posted 5 Days Ago" / "2025-05-01"
  const lc = s.toLowerCase();
  const now = new Date();
  if (lc.includes('today')) return now;
  if (lc.includes('yesterday')) return new Date(now.getTime() - 86_400_000);
  const m = lc.match(/(\d+)\s+days?\s+ago/);
  if (m) return new Date(now.getTime() - parseInt(m[1], 10) * 86_400_000);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Cap detail-fetch concurrency so we don't hammer a single tenant. */
async function pMap<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) {
    const chunk = items.slice(i, i + n);
    const results = await Promise.all(chunk.map(fn));
    out.push(...results);
  }
  return out;
}

export async function ingestWorkdayOrg(cfg: WorkdayConfig, company: string, opts?: { maxJobs?: number }): Promise<IngestResult> {
  const max = opts?.maxJobs ?? 500;
  const result: IngestResult = { org: `${cfg.tenant}/${cfg.site}`, ats: 'greenhouse' as any, fetched: 0, inserted: 0, updated: 0, skipped: 0, errors: 0 };
  // (ats type widened in the IngestResult union for compatibility — caller knows it's workday)
  (result as any).ats = 'workday';

  // Page through the listings.
  const pageSize = 20;
  const allPostings: WorkdayPosting[] = [];
  for (let offset = 0; offset < max; offset += pageSize) {
    const page = await fetchPage(cfg, offset, pageSize);
    if (!page || !page.jobPostings || page.jobPostings.length === 0) break;
    allPostings.push(...page.jobPostings);
    if (allPostings.length >= (page.total ?? max)) break;
  }
  result.fetched = allPostings.length;
  if (allPostings.length === 0) {
    result.errors = 1;
    return result;
  }

  // Fetch details with concurrency cap of 3.
  await pMap(allPostings, 3, async (p) => {
    try {
      const detail = await fetchJobDetail(cfg, p.externalPath);
      const outcome = await upsertJob(p, detail, cfg, company);
      result[outcome]++;
    } catch {
      result.errors++;
    }
  });

  return result;
}
