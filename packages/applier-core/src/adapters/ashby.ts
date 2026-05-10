/**
 * Ashby spec — Tier 1.
 * Modern ATS with good accessibility; selectors are mostly stable.
 */

import type { AtsSpec } from '../types.js';
import { visaAnswer } from '../answers.js';

export const ashbySpec: AtsSpec = {
  ats: 'ashby',
  tier: 1,
  matches: (url, host) => host.includes('ashbyhq.com') || host.includes('jobs.ashbyhq'),

  fields: [
    {
      key: 'fullName',
      kind: 'text',
      label: /name/i,
      selectors: ['input[id*="name" i]', '[data-application-form-input-id="_systemfield_name"]'],
      required: true,
      valueResolver: p => p.fullName,
    },
    {
      key: 'email',
      kind: 'email',
      label: /^email$/i,
      selectors: ['input[type="email"]', '[data-application-form-input-id="_systemfield_email"]'],
      required: true,
      valueResolver: p => p.email,
    },
    {
      key: 'resume',
      kind: 'file',
      label: /resume/i,
      selectors: ['input[type="file"]', '[data-application-form-input-id*="resume" i]'],
      required: true,
    },
    {
      key: 'linkedin',
      kind: 'url',
      label: /linkedin/i,
      selectors: ['[data-application-form-input-id*="linkedin" i] input', 'input[id*="linkedin" i]'],
      valueResolver: p => p.linkedinUrl,
    },
    {
      key: 'work_authorized',
      kind: 'yesno',
      label: /legally authorized|authorized to work/i,
      selectors: ['fieldset:has(legend:matches("authorized")) input[type="radio"]'],
      optionResolver: (p, opts) => opts.find(o => /^yes/i.test(o.trim()) === visaAnswer('work_authorized', p)) ?? null,
    },
    {
      key: 'sponsorship',
      kind: 'yesno',
      label: /sponsorship/i,
      selectors: ['fieldset:has(legend:matches("sponsorship")) input[type="radio"]'],
      optionResolver: (p, opts) => opts.find(o => /^yes/i.test(o.trim()) === visaAnswer('sponsorship', p)) ?? null,
    },
  ],

  submitSelector: 'button[type="submit"]',
  successSelector: '[data-application-submitted="true"], h2:has-text("Thank you")',
  humanRequiredSelectors: ['iframe[title*="captcha" i]', '.cf-turnstile'],
};
