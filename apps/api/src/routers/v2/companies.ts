/**
 * /api/companies/:name/intel — aggregate free-source company intelligence.
 *
 * Stitches together:
 *   - Wikipedia summary + image + founding info (free, no API key)
 *   - Google News RSS (free, no API key) — recent headlines
 *
 * In-memory cached for 6 hours per company. Production should swap to Redis.
 *
 * Routes:
 *   GET /api/companies/:name/intel   → { summary, news[], wiki: {...} }
 */

import { Router, type Request, type Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '@swipehire/db';

export const companiesRouter: Router = Router();

interface WikipediaSummary {
  title: string;
  description?: string;
  extract?: string;
  thumbnailUrl?: string;
  pageUrl?: string;
}

interface NewsItem {
  title: string;
  link: string;
  source?: string;
  publishedAt?: string;
}

interface CompanyIntel {
  company: string;
  fetchedAt: string;
  wiki: WikipediaSummary | null;
  news: NewsItem[];
}

const cache = new Map<string, { at: number; data: CompanyIntel }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function cacheKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Try a few Wikipedia title variants. Returns null on miss. */
async function fetchWikipedia(company: string): Promise<WikipediaSummary | null> {
  // Wikipedia disambiguates company pages with patterns like "X (company)" or "X, Inc.".
  const variants = [
    `${company}, Inc.`,
    `${company} (company)`,
    company,
  ];

  for (const title of variants) {
    try {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`;
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'SwipeHire/2.0 (https://swipehire.io; ops@swipehire.io)',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(4000),
      });
      if (!r.ok) continue;
      const data = await r.json() as any;
      // Skip disambiguation pages.
      if (data.type === 'disambiguation') continue;
      // Heuristic: skip if the result obviously isn't a company.
      const desc = (data.description ?? '').toLowerCase();
      if (desc.includes('film') || desc.includes('album') || desc.includes('song')) continue;

      return {
        title: data.title ?? title,
        description: data.description,
        extract: data.extract,
        thumbnailUrl: data.thumbnail?.source,
        pageUrl: data.content_urls?.desktop?.page,
      };
    } catch {
      // continue to next variant
    }
  }
  return null;
}

/** Naive RSS parser — extracts items via regex. Avoids pulling a 200KB XML lib. */
function parseRssItems(xml: string, max: number): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) && items.length < max) {
    const block = m[1];
    const title = pick(block, /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
    const link = pick(block, /<link>(.*?)<\/link>/);
    const pub = pick(block, /<pubDate>(.*?)<\/pubDate>/);
    // Google News encodes the source inside the title as " - Source Name" suffix.
    const source = pick(block, /<source[^>]*>(.*?)<\/source>/);
    if (title && link) items.push({ title, link, source: source ?? undefined, publishedAt: pub ?? undefined });
  }
  return items;
}

function pick(s: string, re: RegExp): string | null {
  const m = s.match(re);
  if (!m) return null;
  return m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

async function fetchGoogleNews(company: string): Promise<NewsItem[]> {
  try {
    // The literal-quote query is more accurate; fall back to plain if Google rate-limits.
    const q = encodeURIComponent(`"${company}"`);
    const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'SwipeHire/2.0 (+https://swipehire.io)' },
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return [];
    const xml = await r.text();
    return parseRssItems(xml, 5);
  } catch {
    return [];
  }
}

/**
 * Hiring stats from OUR DB — what we actually have data on:
 *   - active openings (count + sponsorship breakdown)
 *   - posting velocity (jobs added in last 30 / 90 / 180 days)
 *   - role distribution (top role keywords)
 *   - salary range across roles in our DB
 *   - latest posting date
 *   - if a target role title is given: role-specific salary range
 *
 * This avoids fragile/paid sources (Levels.fyi, Glassdoor, LinkedIn) by
 * using only the data we ingest from public job boards. Real, citeable.
 */
companiesRouter.get('/api/companies/:name/hiring-stats', async (req: Request, res: Response) => {
  if (!req.session?.userId) {
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }

  const name = req.params.name?.trim();
  if (!name || name.length > 120) {
    res.status(400).json({ error: 'invalid_company_name' });
    return;
  }
  const roleHint = (req.query.role ?? '').toString().trim();

  // 1. Active jobs at this company.
  const totalsRow = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE sponsors_visa)::int AS visa_sponsor,
      COUNT(*) FILTER (WHERE is_remote)::int AS remote,
      COUNT(*) FILTER (WHERE is_hybrid)::int AS hybrid,
      MAX(created_at) AS latest_posted_at,
      MIN(created_at) AS earliest_posted_at
    FROM jobs WHERE company = ${name}
  `);
  const totals = totalsRow.rows?.[0] as any;
  const total = totals?.total ?? 0;

  if (total === 0) {
    res.json({ company: name, hasData: false, message: `No jobs from ${name} in our database yet.` });
    return;
  }

  // 2. Posting velocity windows.
  const velocityRow = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS last_30d,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '90 days')::int AS last_90d,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '180 days')::int AS last_180d
    FROM jobs WHERE company = ${name}
  `);
  const velocity = velocityRow.rows?.[0] as any;

  // 3. Salary range across all roles at this company (where present).
  const salaryRow = await db.execute(sql`
    SELECT
      MIN(salary_min) AS min,
      MAX(salary_max) AS max,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY (COALESCE(salary_min, salary_max) + COALESCE(salary_max, salary_min)) / 2.0) AS median,
      COUNT(*) FILTER (WHERE salary_min IS NOT NULL OR salary_max IS NOT NULL)::int AS jobs_with_salary
    FROM jobs WHERE company = ${name}
  `);
  const salary = salaryRow.rows?.[0] as any;

  // 4. Top role-keyword distribution from job titles.
  const topRoles = await db.execute(sql`
    SELECT
      CASE
        WHEN title ILIKE '%software engineer%' THEN 'Software Engineer'
        WHEN title ILIKE '%data scientist%' OR title ILIKE '%machine learning%' OR title ILIKE '%ml engineer%' THEN 'Data / ML'
        WHEN title ILIKE '%product manager%' THEN 'Product Manager'
        WHEN title ILIKE '%designer%' THEN 'Design'
        WHEN title ILIKE '%marketing%' OR title ILIKE '%growth%' THEN 'Marketing / Growth'
        WHEN title ILIKE '%sales%' OR title ILIKE '%account executive%' THEN 'Sales'
        WHEN title ILIKE '%recruit%' OR title ILIKE '%talent%' THEN 'Recruiting'
        WHEN title ILIKE '%customer%' OR title ILIKE '%support%' THEN 'Customer / Support'
        WHEN title ILIKE '%manager%' OR title ILIKE '%director%' THEN 'Management'
        ELSE 'Other'
      END AS role_group,
      COUNT(*)::int AS n
    FROM jobs WHERE company = ${name}
    GROUP BY role_group
    ORDER BY n DESC
    LIMIT 6
  `);

  // 5. Role-specific salary if user gave a hint.
  let roleSpecific: any = null;
  if (roleHint) {
    const pattern = `%${roleHint.replace(/[%_]/g, '')}%`;
    const r = await db.execute(sql`
      SELECT
        COUNT(*)::int AS matches,
        MIN(salary_min) AS min_low,
        MAX(salary_max) AS max_high,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY salary_min) AS p50_min,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY salary_max) AS p50_max,
        MAX(created_at) AS most_recent_posted
      FROM jobs
      WHERE company = ${name}
        AND title ILIKE ${pattern}
        AND (salary_min IS NOT NULL OR salary_max IS NOT NULL)
    `);
    roleSpecific = r.rows?.[0] ?? null;
  }

  // 6. Per-quarter posting trend (last 4 quarters).
  const quarterly = await db.execute(sql`
    SELECT
      DATE_TRUNC('quarter', created_at) AS quarter,
      COUNT(*)::int AS n
    FROM jobs
    WHERE company = ${name}
      AND created_at >= NOW() - INTERVAL '12 months'
    GROUP BY quarter
    ORDER BY quarter
  `);

  res.json({
    company: name,
    hasData: true,
    activeJobs: {
      total,
      visaSponsor: totals.visa_sponsor,
      remote: totals.remote,
      hybrid: totals.hybrid,
    },
    velocity: {
      last30d: velocity.last_30d,
      last90d: velocity.last_90d,
      last180d: velocity.last_180d,
      latestPostedAt: totals.latest_posted_at,
      earliestPostedAt: totals.earliest_posted_at,
    },
    salary: salary?.jobs_with_salary > 0 ? {
      min: salary.min ? Number(salary.min) : null,
      max: salary.max ? Number(salary.max) : null,
      median: salary.median ? Math.round(Number(salary.median)) : null,
      jobsWithSalary: salary.jobs_with_salary,
    } : null,
    topRoles: (topRoles.rows ?? []).map((r: any) => ({ role: r.role_group, count: r.n })),
    roleSpecific: (roleSpecific?.matches ?? 0) > 0 ? {
      role: roleHint,
      matches: roleSpecific.matches,
      salaryMinLow: roleSpecific.min_low ? Number(roleSpecific.min_low) : null,
      salaryMaxHigh: roleSpecific.max_high ? Number(roleSpecific.max_high) : null,
      p50SalaryMin: roleSpecific.p50_min ? Math.round(Number(roleSpecific.p50_min)) : null,
      p50SalaryMax: roleSpecific.p50_max ? Math.round(Number(roleSpecific.p50_max)) : null,
      mostRecentPostedAt: roleSpecific.most_recent_posted,
    } : null,
    quarterlyPostings: (quarterly.rows ?? []).map((r: any) => ({
      quarter: r.quarter,
      count: r.n,
    })),
  });
});

companiesRouter.get('/api/companies/:name/intel', async (req: Request, res: Response) => {
  // Auth-gated: only logged-in users can hit external APIs through us.
  if (!req.session?.userId) {
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }

  const name = req.params.name?.trim();
  if (!name || name.length > 120) {
    res.status(400).json({ error: 'invalid_company_name' });
    return;
  }

  const key = cacheKey(name);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    res.json({ ...cached.data, cached: true });
    return;
  }

  const [wiki, news] = await Promise.all([fetchWikipedia(name), fetchGoogleNews(name)]);
  const data: CompanyIntel = {
    company: name,
    fetchedAt: new Date().toISOString(),
    wiki,
    news,
  };
  cache.set(key, { at: Date.now(), data });
  res.json({ ...data, cached: false });
});
