/**
 * HTML → PDF via Playwright Chromium.
 *
 * Lazy browser launch + reuse: launching Chromium is ~1-2s, so we keep the
 * browser warm across requests. Pages are short-lived per render.
 */
import { chromium, type Browser } from 'playwright';

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
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
      preferCSSPageSize: true,        // lets the @page rule in the template control margins
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
