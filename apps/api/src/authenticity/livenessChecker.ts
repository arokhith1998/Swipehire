/**
 * Liveness checker — adapted from career-ops/check-liveness.mjs (CC BY).
 *
 * Tests whether a job posting URL is still active. Pure Playwright; zero LLM cost.
 * Per career-ops's hard-learned rule: NEVER use WebFetch/WebSearch to verify
 * a job is still live. Only the rendered DOM is reliable.
 *
 * Sequential within a process. Scale by adding worker processes, not threads.
 */

import { chromium, type Browser, type Page } from 'playwright';

export type LivenessResult = 'active' | 'expired' | 'uncertain';

export interface LivenessCheckOutcome {
  result: LivenessResult;
  reason: string;
  httpStatus: number | null;
  finalUrl: string | null;
  contentLength: number;
  durationMs: number;
}

const EXPIRED_PATTERNS = [
  /job (is )?no longer available/i,
  /job.*no longer open/i,             // Greenhouse standard
  /position has been filled/i,
  /this job has expired/i,
  /job posting has expired/i,
  /no longer accepting applications/i,
  /this (position|role|job) (is )?no longer/i,
  /this job (listing )?is closed/i,
  /job (listing )?not found/i,
  /the page you are looking for doesn.t exist/i,  // Workday 404
  /\d+\s+jobs?\s+found/i,                            // Workday landed on listing page
  /search for jobs page is loaded/i,                 // Workday SPA indicator
  /diese stelle (ist )?(nicht mehr|bereits) besetzt/i,
  /offre (expirée|n'est plus disponible)/i,
];

const EXPIRED_URL_PATTERNS = [
  /[?&]error=true/i,                  // Greenhouse redirect on closed jobs
];

const APPLY_PATTERNS = [
  /\bapply\b/i,
  /\bsolicitar\b/i,
  /\bbewerben\b/i,
  /\bpostuler\b/i,
  /submit application/i,
  /easy apply/i,
  /start application/i,                // Ashby
  /ich bewerbe mich/i,                 // German Greenhouse
];

const MIN_CONTENT_CHARS = 300;
const NAV_TIMEOUT_MS = 15_000;
const POST_LOAD_WAIT_MS = 2_000;
const PARSER_VERSION = 'liveness-v1.0.0';

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.isConnected()) return _browser;
  _browser = await chromium.launch({ headless: true });
  return _browser;
}

export async function closeBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

/**
 * Check a single URL. Sequential; never call this in parallel from the same process.
 */
export async function checkLiveness(url: string): Promise<LivenessCheckOutcome> {
  const t0 = Date.now();
  const browser = await getBrowser();
  const page = await browser.newPage();
  let httpStatus: number | null = null;
  let finalUrl: string | null = null;
  let contentLength = 0;

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    httpStatus = response?.status() ?? null;

    if (httpStatus === 404 || httpStatus === 410) {
      return finish('expired', `HTTP ${httpStatus}`);
    }

    await page.waitForTimeout(POST_LOAD_WAIT_MS);  // Let SPAs hydrate
    finalUrl = page.url();

    for (const pattern of EXPIRED_URL_PATTERNS) {
      if (pattern.test(finalUrl)) return finish('expired', `redirect to ${finalUrl}`);
    }

    const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
    contentLength = bodyText.length;

    // Apply button is the strongest positive — check first.
    if (APPLY_PATTERNS.some(p => p.test(bodyText))) {
      return finish('active', 'apply button detected');
    }

    for (const pattern of EXPIRED_PATTERNS) {
      if (pattern.test(bodyText)) {
        return finish('expired', `pattern matched: ${pattern.source.slice(0, 40)}`);
      }
    }

    if (bodyText.trim().length < MIN_CONTENT_CHARS) {
      return finish('expired', 'insufficient content — likely nav/footer only');
    }

    return finish('uncertain', 'content present but no apply button found');
  } catch (err: any) {
    return finish('expired', `navigation error: ${(err.message ?? String(err)).split('\n')[0]}`);
  } finally {
    await page.close().catch(() => undefined);
  }

  function finish(result: LivenessResult, reason: string): LivenessCheckOutcome {
    return {
      result,
      reason,
      httpStatus,
      finalUrl,
      contentLength,
      durationMs: Date.now() - t0,
    };
  }
}

export const PARSER_INFO = { version: PARSER_VERSION };
