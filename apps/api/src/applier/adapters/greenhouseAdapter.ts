/**
 * Greenhouse adapter — Tier 1 (full auto-submit).
 *
 * Greenhouse forms have stable structure across boards. We use the public
 * embed URL and Playwright to fill + submit. Sequential within a process.
 */

import { chromium, type Browser, type Page } from 'playwright';
import type { AtsAdapter, ApplyContext, ApplyResult } from '../types.js';

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser?.isConnected()) return _browser;
  _browser = await chromium.launch({ headless: true });
  return _browser;
}

export const greenhouseAdapter: AtsAdapter = {
  ats: 'greenhouse',
  tier: 1,

  async apply(ctx: ApplyContext): Promise<ApplyResult> {
    const t0 = Date.now();
    const browser = await getBrowser();
    const page = await browser.newPage();
    const filledFields: string[] = [];
    const unansweredQuestions: string[] = [];

    try {
      await page.goto(ctx.jobUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(1500);

      // Standard Greenhouse fields (use accessibility tree where possible)
      const FIELD_MAP: Array<{ label: string | RegExp; value: string | undefined; selector?: string }> = [
        { label: /first name/i, value: ctx.answers.fullName.split(' ')[0] },
        { label: /last name/i, value: ctx.answers.fullName.split(' ').slice(1).join(' ') },
        { label: /^email$/i, value: ctx.answers.email },
        { label: /phone/i, value: ctx.answers.phone },
        { label: /linkedin/i, value: ctx.answers.linkedinUrl },
        { label: /github|portfolio/i, value: ctx.answers.portfolioUrl ?? ctx.answers.githubUrl },
      ];

      for (const f of FIELD_MAP) {
        if (!f.value) continue;
        try {
          await page.getByLabel(f.label).first().fill(f.value, { timeout: 4000 });
          filledFields.push(String(f.label));
        } catch {
          // Label not found, try selector fallbacks (most common Greenhouse IDs)
        }
      }

      // Resume file upload — Greenhouse uses file inputs
      if (ctx.resumeFilePath) {
        try {
          const fileInput = await page.locator('input[type="file"]').first();
          await fileInput.setInputFiles(ctx.resumeFilePath);
          filledFields.push('resume file');
        } catch (err) {
          unansweredQuestions.push(`resume file upload failed: ${err}`);
        }
      }

      // Visa questions — radio/select
      try {
        const authQ = page.getByText(/are you (legally )?authorized to work/i).first();
        if (await authQ.isVisible({ timeout: 2000 })) {
          const yesRadio = page.getByLabel(ctx.answers.workAuthorized ? 'Yes' : 'No').first();
          await yesRadio.check({ timeout: 3000 });
          filledFields.push('work authorization');
        }
      } catch { /* not present */ }

      try {
        const sponsorQ = page.getByText(/(require|need).*(visa|sponsorship)/i).first();
        if (await sponsorQ.isVisible({ timeout: 2000 })) {
          const ans = page.getByLabel(ctx.answers.requiresSponsorship ? 'Yes' : 'No').first();
          await ans.check({ timeout: 3000 });
          filledFields.push('sponsorship');
        }
      } catch { /* not present */ }

      // Detect remaining required fields
      const requiredFields = await page.locator('[aria-required="true"]:not([value]):not([data-filled])').count();
      if (requiredFields > 0) {
        return finish('requires_human', `${requiredFields} required fields remain unfilled`);
      }

      // Submit
      const submit = page.getByRole('button', { name: /submit application/i });
      await submit.click({ timeout: 10_000 });
      await page.waitForLoadState('networkidle', { timeout: 30_000 });

      const success = await page.getByText(/thank you|application received|we.ll be in touch/i).first().isVisible({ timeout: 5000 }).catch(() => false);

      return finish(success ? 'success' : 'requires_human', success ? 'submission confirmed' : 'no confirmation text detected');

    } catch (err: any) {
      return finish('failed', `unexpected error: ${err.message ?? String(err)}`);
    } finally {
      await page.close().catch(() => undefined);
    }

    function finish(status: 'success' | 'failed' | 'requires_human', reason: string): ApplyResult {
      return {
        status,
        reason,
        durationMs: Date.now() - t0,
        filledFields,
        unansweredQuestions,
      };
    }
  },
};
