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
