/**
 * ATS detection — given a URL, identify which ATS the page belongs to.
 * Used by both the server-side ingester and the extension content script.
 */

import type { AtsSpec } from './types.js';

export interface DetectionResult {
  ats: string;
  confidence: number;   // 0-1
  spec?: AtsSpec;
}

/**
 * Detect ATS from URL alone (works at ingest time, before page is loaded).
 */
export function detectAtsFromUrl(url: string): { ats: string; confidence: number } {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return { ats: 'unknown', confidence: 0 };
  }

  if (host.includes('greenhouse.io') || host.includes('boards.greenhouse')) return { ats: 'greenhouse', confidence: 0.99 };
  if (host.includes('lever.co')) return { ats: 'lever', confidence: 0.99 };
  if (host.includes('ashbyhq.com') || host.includes('jobs.ashbyhq.com')) return { ats: 'ashby', confidence: 0.99 };
  if (host.includes('myworkdayjobs.com') || host.includes('workday')) return { ats: 'workday', confidence: 0.97 };
  if (host.includes('icims.com')) return { ats: 'icims', confidence: 0.97 };
  if (host.includes('smartrecruiters.com')) return { ats: 'smartrecruiters', confidence: 0.97 };
  if (host.includes('jobvite.com')) return { ats: 'jobvite', confidence: 0.95 };
  if (host.includes('taleo.net')) return { ats: 'taleo', confidence: 0.95 };
  if (host.includes('workable.com')) return { ats: 'workable', confidence: 0.95 };

  // Custom career page — use the generic spec
  return { ats: 'custom', confidence: 0.40 };
}

/**
 * Browser-side: confirm detection by looking for ATS-specific markers in the DOM.
 * Caller passes in a function to query the DOM (so this is environment-agnostic).
 */
export function detectAtsFromDom(query: (sel: string) => boolean): { ats: string; confidence: number } {
  // Greenhouse: form id starts with #grnhse_iframe or #application_form
  if (query('#application_form, .application--form, [id^="grnhse"]')) return { ats: 'greenhouse', confidence: 0.99 };
  // Lever: .application-page or data-qa="application-page"
  if (query('[data-qa^="application-"], .application-page, .application-form')) return { ats: 'lever', confidence: 0.99 };
  // Ashby: ._jobPosting or [data-application-form-input-id]
  if (query('[data-application-form-input-id], ._jobPosting_')) return { ats: 'ashby', confidence: 0.97 };
  // Workday
  if (query('[data-automation-id^="formField"], [data-automation-id="jobDetailsContent"]')) return { ats: 'workday', confidence: 0.96 };
  // iCIMS
  if (query('.iCIMS_Anchor, .iCIMS_FormElement')) return { ats: 'icims', confidence: 0.95 };
  // SmartRecruiters
  if (query('.application-form, [data-test^="application-form"]')) return { ats: 'smartrecruiters', confidence: 0.93 };
  return { ats: 'unknown', confidence: 0 };
}
