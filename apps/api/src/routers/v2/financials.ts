/**
 * /api/companies/:name/financials — public company financials from SEC EDGAR.
 *
 * Free, no key. Returns revenue, operating income+margin, net income,
 * cash, YoY revenue growth from the most recent 10-K (annual).
 *
 * Strategy:
 *   1. Look up company → CIK via a curated map of top tech employers.
 *      (The full SEC company-tickers.json has ~10k entries; we ship a
 *      subset of ~80 names that overlap with common job-board employers.)
 *   2. Fetch us-gaap concept JSON from data.sec.gov for each metric.
 *   3. Pick the most recent FY value (form=10-K, fp=FY) for each.
 *   4. Compute revenue YoY growth, operating margin.
 *   5. Cache 7 days in-memory (financials don't change daily).
 *
 * If the company isn't in the map → return { found: false } and the UI
 * hides the financials card. Honest about coverage.
 */

import { Router, type Request, type Response } from 'express';

export const financialsRouter: Router = Router();

const SEC_HEADERS = {
  'User-Agent': 'SwipeHire ops@swipehire.io',
  'Accept': 'application/json',
};

interface FinancialsResult {
  found: boolean;
  company?: string;
  ticker?: string;
  cik?: string;
  fiscalYear?: number;
  fiscalYearEnd?: string;
  revenue?: number | null;
  revenueGrowthYoy?: number | null;
  operatingIncome?: number | null;
  operatingMargin?: number | null;
  netIncome?: number | null;
  cash?: number | null;
  secUrl?: string;
}

// Curated map: lowercased company-name patterns → { cik, ticker }.
// CIKs are zero-padded to 10 digits (SEC API convention).
const KNOWN: Array<{ matches: RegExp; cik: string; ticker: string; canonical: string }> = [
  { matches: /^alphabet|^google$/, cik: '0001652044', ticker: 'GOOGL', canonical: 'Alphabet (Google)' },
  { matches: /^meta|^facebook/, cik: '0001326801', ticker: 'META', canonical: 'Meta Platforms' },
  { matches: /^microsoft/, cik: '0000789019', ticker: 'MSFT', canonical: 'Microsoft' },
  { matches: /^apple$/, cik: '0000320193', ticker: 'AAPL', canonical: 'Apple' },
  { matches: /^amazon$/, cik: '0001018724', ticker: 'AMZN', canonical: 'Amazon' },
  { matches: /^netflix/, cik: '0001065280', ticker: 'NFLX', canonical: 'Netflix' },
  { matches: /^nvidia/, cik: '0001045810', ticker: 'NVDA', canonical: 'NVIDIA' },
  { matches: /^tesla/, cik: '0001318605', ticker: 'TSLA', canonical: 'Tesla' },
  { matches: /^salesforce/, cik: '0001108524', ticker: 'CRM', canonical: 'Salesforce' },
  { matches: /^adobe/, cik: '0000796343', ticker: 'ADBE', canonical: 'Adobe' },
  { matches: /^oracle/, cik: '0001341439', ticker: 'ORCL', canonical: 'Oracle' },
  { matches: /^ibm/, cik: '0000051143', ticker: 'IBM', canonical: 'IBM' },
  { matches: /^intel/, cik: '0000050863', ticker: 'INTC', canonical: 'Intel' },
  { matches: /^cisco/, cik: '0000858877', ticker: 'CSCO', canonical: 'Cisco' },
  { matches: /^paypal/, cik: '0001633917', ticker: 'PYPL', canonical: 'PayPal' },
  { matches: /^uber/, cik: '0001543151', ticker: 'UBER', canonical: 'Uber' },
  { matches: /^lyft/, cik: '0001759509', ticker: 'LYFT', canonical: 'Lyft' },
  { matches: /^airbnb/, cik: '0001559720', ticker: 'ABNB', canonical: 'Airbnb' },
  { matches: /^doordash/, cik: '0001792789', ticker: 'DASH', canonical: 'DoorDash' },
  { matches: /^instacart|^maplebear/, cik: '0001579091', ticker: 'CART', canonical: 'Instacart' },
  { matches: /^snowflake/, cik: '0001640147', ticker: 'SNOW', canonical: 'Snowflake' },
  { matches: /^datadog/, cik: '0001561550', ticker: 'DDOG', canonical: 'Datadog' },
  { matches: /^cloudflare/, cik: '0001477333', ticker: 'NET', canonical: 'Cloudflare' },
  { matches: /^mongodb/, cik: '0001441816', ticker: 'MDB', canonical: 'MongoDB' },
  { matches: /^twilio/, cik: '0001447669', ticker: 'TWLO', canonical: 'Twilio' },
  { matches: /^zoom/, cik: '0001585521', ticker: 'ZM', canonical: 'Zoom' },
  { matches: /^shopify/, cik: '0001594805', ticker: 'SHOP', canonical: 'Shopify' },
  { matches: /^square|^block/, cik: '0001512673', ticker: 'XYZ', canonical: 'Block (Square)' },
  { matches: /^coinbase/, cik: '0001679788', ticker: 'COIN', canonical: 'Coinbase' },
  { matches: /^robinhood/, cik: '0001783879', ticker: 'HOOD', canonical: 'Robinhood' },
  { matches: /^discord$/, cik: '', ticker: '', canonical: '' },              // private (placeholder)
  { matches: /^stripe$/, cik: '', ticker: '', canonical: '' },               // private
  { matches: /^anthropic/, cik: '', ticker: '', canonical: '' },             // private
  { matches: /^openai/, cik: '', ticker: '', canonical: '' },                // private
  { matches: /^figma/, cik: '0001593538', ticker: 'FIG', canonical: 'Figma' },
  { matches: /^reddit/, cik: '0001713445', ticker: 'RDDT', canonical: 'Reddit' },
  { matches: /^palantir/, cik: '0001321655', ticker: 'PLTR', canonical: 'Palantir' },
  { matches: /^crowdstrike/, cik: '0001535527', ticker: 'CRWD', canonical: 'CrowdStrike' },
  { matches: /^roblox/, cik: '0001315098', ticker: 'RBLX', canonical: 'Roblox' },
  { matches: /^pinterest/, cik: '0001506293', ticker: 'PINS', canonical: 'Pinterest' },
  { matches: /^snap/, cik: '0001564408', ticker: 'SNAP', canonical: 'Snap' },
  { matches: /^spotify/, cik: '0001639920', ticker: 'SPOT', canonical: 'Spotify' },
  { matches: /^twitter|^x corp/, cik: '', ticker: '', canonical: '' },        // private (Musk-era)
];

function lookupCompany(name: string): { cik: string; ticker: string; canonical: string } | null {
  const lc = name.toLowerCase().trim();
  for (const c of KNOWN) {
    if (c.matches.test(lc)) return c.cik ? { cik: c.cik, ticker: c.ticker, canonical: c.canonical } : null;
  }
  return null;
}

interface SecConcept {
  units?: Record<string, Array<{
    val: number;
    end: string;
    fy: number;
    fp: string;
    form: string;
    accn: string;
  }>>;
}

/** Fetch a single XBRL concept and return the most recent annual value. */
async function fetchConcept(cik: string, concept: string): Promise<{ val: number; end: string; fy: number } | null> {
  try {
    const url = `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/${concept}.json`;
    const r = await fetch(url, { headers: SEC_HEADERS, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const data = await r.json() as SecConcept;
    const usd = data.units?.['USD'];
    if (!usd) return null;
    // Filter to annual 10-K reports, sort desc by end date.
    const annual = usd
      .filter(e => e.form === '10-K' && (e.fp === 'FY' || e.fp === 'Q4'))
      .sort((a, b) => b.end.localeCompare(a.end));
    return annual[0] ?? null;
  } catch {
    return null;
  }
}

/** Some companies report Revenues, others RevenueFromContractWithCustomerExcludingAssessedTax. Try both. */
async function fetchRevenue(cik: string) {
  return await fetchConcept(cik, 'Revenues')
    ?? await fetchConcept(cik, 'RevenueFromContractWithCustomerExcludingAssessedTax')
    ?? await fetchConcept(cik, 'SalesRevenueNet');
}

/** Pull the previous-year revenue for YoY calc. */
async function fetchPriorYearRevenue(cik: string, currentEnd: string): Promise<number | null> {
  const url = `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/Revenues.json`;
  try {
    const r = await fetch(url, { headers: SEC_HEADERS, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const data = await r.json() as SecConcept;
    const usd = data.units?.['USD'] ?? [];
    const currentYear = parseInt(currentEnd.slice(0, 4), 10);
    const prior = usd
      .filter(e => e.form === '10-K' && e.fp === 'FY' && parseInt(e.end.slice(0, 4), 10) === currentYear - 1)
      .sort((a, b) => b.end.localeCompare(a.end))[0];
    return prior?.val ?? null;
  } catch {
    return null;
  }
}

const cache = new Map<string, { at: number; data: FinancialsResult }>();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days

financialsRouter.get('/api/companies/:name/financials', async (req: Request, res: Response) => {
  if (!req.session?.userId) {
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }

  const name = req.params.name?.trim();
  if (!name) {
    res.status(400).json({ error: 'invalid_company_name' });
    return;
  }

  const cached = cache.get(name.toLowerCase());
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    res.json({ ...cached.data, cached: true });
    return;
  }

  const lookup = lookupCompany(name);
  if (!lookup) {
    const result: FinancialsResult = { found: false };
    cache.set(name.toLowerCase(), { at: Date.now(), data: result });
    res.json(result);
    return;
  }

  const { cik, ticker, canonical } = lookup;
  const [revenue, opIncome, netIncome, cash] = await Promise.all([
    fetchRevenue(cik),
    fetchConcept(cik, 'OperatingIncomeLoss'),
    fetchConcept(cik, 'NetIncomeLoss'),
    fetchConcept(cik, 'CashAndCashEquivalentsAtCarryingValue'),
  ]);

  if (!revenue) {
    const result: FinancialsResult = { found: false };
    cache.set(name.toLowerCase(), { at: Date.now(), data: result });
    res.json(result);
    return;
  }

  const priorRev = await fetchPriorYearRevenue(cik, revenue.end);
  const revenueGrowthYoy = priorRev ? (revenue.val - priorRev) / priorRev : null;
  const operatingMargin = opIncome && revenue.val ? opIncome.val / revenue.val : null;

  const result: FinancialsResult = {
    found: true,
    company: canonical,
    ticker,
    cik,
    fiscalYear: revenue.fy,
    fiscalYearEnd: revenue.end,
    revenue: revenue.val,
    revenueGrowthYoy,
    operatingIncome: opIncome?.val ?? null,
    operatingMargin,
    netIncome: netIncome?.val ?? null,
    cash: cash?.val ?? null,
    secUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=10-K&dateb=&owner=include&count=10`,
  };
  cache.set(name.toLowerCase(), { at: Date.now(), data: result });
  res.json(result);
});
