/**
 * HTML → PDF via Playwright Chromium.
 *
 * Lazy browser launch + reuse: launching Chromium is ~1-2s, so we keep the
 * browser warm across requests. Pages are short-lived per render.
 *
 * IMPORTANT: PLAYWRIGHT_BROWSERS_PATH must be set BEFORE playwright is
 * imported, because playwright reads it at module load and caches the
 * lookup root. We use a dynamic import inside getBrowser() so the env
 * var assignment below always runs first.
 */

// Force Playwright to look inside /app/.cache (where nixpacks build phase
// installed the binaries) rather than the default ~/.cache/ms-playwright,
// which lives at /root/.cache and isn't preserved into Railway's runtime image.
// No-op if PLAYWRIGHT_BROWSERS_PATH is already set externally.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/app/.cache/ms-playwright';
}

import type { Browser } from 'playwright';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

let browser: Browser | null = null;
let installPromise: Promise<void> | null = null;

/** Install chromium-headless-shell at startup if the binary isn't already there.
 *  Idempotent + cached: only runs once per process. */
async function ensureInstalled(): Promise<void> {
  if (installPromise) return installPromise;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/app/.cache/ms-playwright';
  if (existsSync(root)) {
    installPromise = Promise.resolve();
    return installPromise;
  }
  // eslint-disable-next-line no-console
  console.log('[pdf] Chromium not found at', root, '— installing…');
  installPromise = new Promise<void>((resolve, reject) => {
    const proc = spawn('npx', ['playwright', 'install', 'chromium-headless-shell'], {
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: root },
      stdio: 'inherit',
    });
    proc.on('exit', code => {
      if (code === 0) {
        // eslint-disable-next-line no-console
        console.log('[pdf] Chromium install done');
        resolve();
      } else {
        reject(new Error(`playwright install exited ${code}`));
      }
    });
    proc.on('error', reject);
  });
  return installPromise;
}

async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
  await ensureInstalled();
  // Dynamic import so the env var assignment above always executes first.
  const { chromium } = await import('playwright');
  browser = await chromium.launch({ args: ['--no-sandbox'] });
  return browser;
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return pdf;
  } finally {
    await page.close();
  }
}

export async function closePdfBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
