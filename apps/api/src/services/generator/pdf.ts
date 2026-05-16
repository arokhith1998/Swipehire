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
import { existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';

let browser: Browser | null = null;
let installPromise: Promise<void> | null = null;

/** Install chromium-headless-shell at startup if the binary isn't already there.
 *  Idempotent + cached: only runs once per process. */
function runInstallStep(args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn('npx', ['playwright', ...args], {
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || '/app/.cache/ms-playwright' },
      stdio: 'inherit',
    });
    proc.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`playwright ${args.join(' ')} exited ${code}`));
    });
    proc.on('error', reject);
  });
}

async function ensureInstalled(): Promise<void> {
  if (installPromise) return installPromise;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/app/.cache/ms-playwright';
  const haveBinary = existsSync(root);

  installPromise = (async () => {
    if (!haveBinary) {
      // eslint-disable-next-line no-console
      console.log('[pdf] Chromium not found at', root, '— installing binary…');
      await runInstallStep(['install', 'chromium-headless-shell']);
    }
    // Always try install-deps on first run — installs system libs (libnss3,
    // libxkbcommon, etc.) via apt-get. Idempotent + cheap if already present.
    // Failure is non-fatal: nixpacks build may have installed them already.
    try {
      // eslint-disable-next-line no-console
      console.log('[pdf] Ensuring Chromium system deps…');
      await runInstallStep(['install-deps', 'chromium-headless-shell']);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.warn('[pdf] install-deps failed (continuing):', e.message);
    }
    // eslint-disable-next-line no-console
    console.log('[pdf] Chromium ready');
  })();
  return installPromise;
}

/** Find the chrome-headless-shell binary on disk no matter where it ended up. */
function findChromiumExecutable(): string | null {
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH || '/app/.cache/ms-playwright',
    '/app/.cache/ms-playwright',
    '/root/.cache/ms-playwright',
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    try {
      const shellDir = readdirSync(root).find(n => n.startsWith('chromium_headless_shell-'));
      if (shellDir) {
        const exe = `${root}/${shellDir}/chrome-headless-shell-linux64/chrome-headless-shell`;
        if (existsSync(exe)) return exe;
      }
    } catch { /* keep trying */ }
  }
  return null;
}

async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
  await ensureInstalled();
  // Dynamic import so the env var assignment above always executes first.
  const { chromium } = await import('playwright');
  // Pass executablePath explicitly so we bypass playwright's internal path
  // resolution, which was caching the wrong root somewhere upstream.
  const exe = findChromiumExecutable();
  browser = await chromium.launch({
    args: ['--no-sandbox'],
    ...(exe ? { executablePath: exe } : {}),
  });
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
