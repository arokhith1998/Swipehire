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

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
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
