/**
 * Discover which ATS (Greenhouse / Lever / Ashby) each top H1B sponsor uses.
 *
 * Pulls top N sponsors from visa.lca_records (most LCAs filed in last 24mo),
 * generates candidate slugs from the company name, probes each ATS endpoint,
 * and writes the discovered registry to packages/db/src/seeds/ats-registry.json.
 *
 * Usage:
 *   pnpm --filter @swipehire/api discover:ats [--top=500]
 *
 * Designed to be safe to re-run; merges with existing registry.
 */

import { db } from '@swipehire/db';
import { sql } from 'drizzle-orm';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = resolve(here, '../../../packages/db/src/seeds/ats-registry.json');

interface RegistryEntry {
  company: string;          // canonical display name from LCA records
  ats: 'greenhouse' | 'lever' | 'ashby';
  slug: string;
  fein?: string;
  totalLcas24mo?: number;
  discoveredAt: string;
}

/** Generic single words that match too many random ATSs — produce false positives. */
const GENERIC_WORDS = new Set([
  'general', 'capital', 'us', 'usa', 'national', 'american', 'global', 'first',
  'state', 'united', 'group', 'tech', 'systems', 'solutions', 'services',
  'consulting', 'partners', 'data', 'cloud', 'digital', 'mobile', 'health',
  'medical', 'bank', 'banking', 'financial', 'insurance',
]);

/** Convert a company name to slug candidates to try. */
function slugCandidates(name: string): string[] {
  const base = name.toLowerCase()
    .replace(/[,.()'"&]/g, '')
    .replace(/\binc\b|\bllc\b|\bcorp\b|\bcorporation\b|\blimited\b|\bltd\b|\bplc\b|\bco\b|\bcompany\b|\bgroup\b|\bholdings\b|\bpbc\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const variants = new Set<string>();
  variants.add(base.replace(/\s+/g, '-'));
  variants.add(base.replace(/\s+/g, ''));
  const firstWord = base.split(' ')[0];
  // Only use first-word slug if distinctive (avoids "general"/"capital"/"us")
  if (firstWord && firstWord.length >= 5 && !GENERIC_WORDS.has(firstWord)) {
    variants.add(firstWord);
  }
  const twoWords = base.split(' ').slice(0, 2).join('');
  if (twoWords && twoWords.length >= 5 && twoWords !== firstWord) variants.add(twoWords);
  return Array.from(variants).filter(s => s.length >= 4 && s.length <= 50);
}

interface ProbeResult {
  ats: 'greenhouse' | 'lever' | 'ashby';
  slug: string;
  jobCount: number;
}

async function probeGreenhouse(slug: string): Promise<number | null> {
  try {
    const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`, {
      headers: { 'User-Agent': 'SwipeHire/2.0 (+https://swipehire.io)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const data = await r.json() as { jobs?: any[] };
    return data.jobs?.length ?? 0;
  } catch { return null; }
}

async function probeLever(slug: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, {
      headers: { 'User-Agent': 'SwipeHire/2.0 (+https://swipehire.io)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const data = await r.json() as any;
    if (!Array.isArray(data)) return null;
    return data.length;
  } catch { return null; }
}

async function probeAshby(slug: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, {
      headers: { 'User-Agent': 'SwipeHire/2.0 (+https://swipehire.io)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const data = await r.json() as any;
    return data?.jobs?.length ?? 0;
  } catch { return null; }
}

/** Try all three ATSs across all slug variants. Return the best hit (highest job count). */
async function discover(name: string): Promise<ProbeResult | null> {
  const slugs = slugCandidates(name);
  let best: ProbeResult | null = null;
  for (const slug of slugs) {
    // Probe in parallel.
    const [g, l, a] = await Promise.all([
      probeGreenhouse(slug), probeLever(slug), probeAshby(slug),
    ]);
    const candidates: ProbeResult[] = [];
    if (g != null && g > 0) candidates.push({ ats: 'greenhouse', slug, jobCount: g });
    if (l != null && l > 0) candidates.push({ ats: 'lever', slug, jobCount: l });
    if (a != null && a > 0) candidates.push({ ats: 'ashby', slug, jobCount: a });
    for (const c of candidates) {
      if (!best || c.jobCount > best.jobCount) best = c;
    }
  }
  return best;
}

async function main() {
  const topArg = process.argv.find(a => a.startsWith('--top='));
  const top = topArg ? parseInt(topArg.slice(6), 10) : 500;
  console.log(`Discovering ATS slugs for top ${top} H1B sponsors...`);

  // Pull top sponsors by 24mo LCA count.
  const sponsors = await db.execute(sql`
    SELECT employer_name, fein, COUNT(*)::int AS lcas
    FROM visa.lca_records
    WHERE decision_date >= NOW() - INTERVAL '24 months'
      AND fein IS NOT NULL
      AND employer_name IS NOT NULL
    GROUP BY employer_name, fein
    ORDER BY lcas DESC
    LIMIT ${top}
  `);

  const sponsorList = (sponsors.rows ?? []) as Array<{ employer_name: string; fein: string; lcas: number }>;
  console.log(`Got ${sponsorList.length} sponsors from DOL data.`);

  // Load existing registry.
  let registry: Record<string, RegistryEntry> = {};
  if (existsSync(REGISTRY_PATH)) {
    registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
    console.log(`Loaded ${Object.keys(registry).length} existing registry entries.`);
  }

  let found = 0, missed = 0, alreadyHave = 0;
  let i = 0;
  for (const sponsor of sponsorList) {
    i++;
    const key = sponsor.fein;
    if (registry[key]) {
      alreadyHave++;
      continue;
    }
    const result = await discover(sponsor.employer_name);
    if (result) {
      registry[key] = {
        company: sponsor.employer_name,
        ats: result.ats,
        slug: result.slug,
        fein: sponsor.fein,
        totalLcas24mo: sponsor.lcas,
        discoveredAt: new Date().toISOString(),
      };
      found++;
      console.log(`  [${i}/${sponsorList.length}] ✓ ${sponsor.employer_name} → ${result.ats}/${result.slug} (${result.jobCount} jobs, ${sponsor.lcas} LCAs)`);
    } else {
      missed++;
      if (i % 25 === 0) console.log(`  [${i}/${sponsorList.length}] (no ATS match for last 25; ${found} found so far)`);
    }
    // Save incrementally every 50 to avoid losing progress.
    if (i % 50 === 0) {
      writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
    }
  }

  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  console.log(`\n=== Discovery complete ===`);
  console.log(`  Newly discovered:  ${found}`);
  console.log(`  Already in registry: ${alreadyHave}`);
  console.log(`  Total in registry: ${Object.keys(registry).length}`);
  console.log(`  Could not match:   ${missed}`);
  console.log(`  Coverage:          ${(((found + alreadyHave) / sponsorList.length) * 100).toFixed(1)}%`);
  console.log(`\nRegistry written to: ${REGISTRY_PATH}`);
  process.exit(0);
}

main().catch(e => { console.error('discover failed:', e); process.exit(1); });
