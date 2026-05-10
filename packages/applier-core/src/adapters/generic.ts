/**
 * Generic spec — used by the extension as a last-resort universal fill.
 *
 * Strategy: match form fields by their nearby labels rather than by ATS-specific
 * selectors. The extension caller does the label-extraction; the spec defines
 * which keys we have answers for and how to resolve them.
 *
 * For unknown questions, the extension calls /api/applier/classify-field
 * which uses the ML sidecar /embed to find the closest known field by
 * embedding similarity to the question label.
 */

import type { AtsSpec } from '../types.js';
import { visaAnswer } from '../answers.js';

export const genericSpec: AtsSpec = {
  ats: 'custom',
  tier: 3,
  matches: () => true,   // catch-all

  fields: [
    { key: 'fullName',  kind: 'text',  label: /^(full )?name$/i, selectors: [], valueResolver: p => p.fullName },
    { key: 'firstName', kind: 'text',  label: /first name/i,     selectors: [], valueResolver: p => p.fullName.split(' ')[0] },
    { key: 'lastName',  kind: 'text',  label: /last name|surname/i, selectors: [], valueResolver: p => p.fullName.split(' ').slice(1).join(' ') },
    { key: 'email',     kind: 'email', label: /^email/i,         selectors: [], valueResolver: p => p.email },
    { key: 'phone',     kind: 'phone', label: /phone|mobile/i,   selectors: [], valueResolver: p => p.phone },
    { key: 'location',  kind: 'text',  label: /location|city|address/i, selectors: [], valueResolver: p => p.location },
    { key: 'linkedin',  kind: 'url',   label: /linkedin/i,        selectors: [], valueResolver: p => p.linkedinUrl },
    { key: 'github',    kind: 'url',   label: /github/i,          selectors: [], valueResolver: p => p.githubUrl },
    { key: 'portfolio', kind: 'url',   label: /portfolio|website/i, selectors: [], valueResolver: p => p.portfolioUrl },
    { key: 'resume',    kind: 'file',  label: /resume|cv|upload/i,  selectors: [], required: true },
    { key: 'coverLetter', kind: 'textarea', label: /cover letter|why do you want|tell us/i, selectors: [], valueResolver: p => p.coverLetter },
    { key: 'salaryExpectation', kind: 'text', label: /salary expectation|expected (salary|comp)/i, selectors: [], valueResolver: p => p.salaryExpectation },
    { key: 'yearsOfExperience', kind: 'text', label: /years of experience|how many years/i, selectors: [], valueResolver: p => p.yearsOfExperience?.toString() },
    {
      key: 'work_authorized',
      kind: 'yesno',
      label: /legally authorized|authorized to work|right to work/i,
      selectors: [],
      optionResolver: (p, opts) => opts.find(o => /^yes/i.test(o.trim()) === visaAnswer('work_authorized', p)) ?? null,
    },
    {
      key: 'sponsorship',
      kind: 'yesno',
      label: /(require|need).*(visa|sponsorship)|sponsorship now or in the future/i,
      selectors: [],
      optionResolver: (p, opts) => opts.find(o => /^yes/i.test(o.trim()) === visaAnswer('sponsorship', p)) ?? null,
    },
  ],

  submitSelector: 'button[type="submit"], input[type="submit"]',
  successSelector: 'h1:has-text("Thank"), h2:has-text("Thank"), .success-message, [class*="success" i]',
  humanRequiredSelectors: ['iframe[title*="captcha" i]', '.g-recaptcha', '.cf-turnstile', '.h-captcha'],
};
