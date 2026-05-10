/**
 * Lever spec — Tier 1.
 * Lever forms are simpler than Greenhouse but use less stable selectors.
 */

import type { AtsSpec } from '../types.js';
import { visaAnswer } from '../answers.js';

export const leverSpec: AtsSpec = {
  ats: 'lever',
  tier: 1,
  matches: (url, host) => host.includes('lever.co'),

  fields: [
    {
      key: 'fullName',
      kind: 'text',
      label: /full name/i,
      selectors: ['input[name="name"]', 'input[autocomplete="name"]'],
      required: true,
      valueResolver: p => p.fullName,
    },
    {
      key: 'email',
      kind: 'email',
      label: /^email$/i,
      selectors: ['input[name="email"]', 'input[type="email"]'],
      required: true,
      valueResolver: p => p.email,
    },
    {
      key: 'phone',
      kind: 'phone',
      label: /phone/i,
      selectors: ['input[name="phone"]', 'input[type="tel"]'],
      valueResolver: p => p.phone,
    },
    {
      key: 'company',
      kind: 'text',
      label: /current company/i,
      selectors: ['input[name="org"]'],
      valueResolver: p => p.customAnswers?.currentCompany,
    },
    {
      key: 'linkedin',
      kind: 'url',
      label: /linkedin/i,
      selectors: ['input[name="urls[LinkedIn]"]'],
      valueResolver: p => p.linkedinUrl,
    },
    {
      key: 'github',
      kind: 'url',
      label: /github/i,
      selectors: ['input[name="urls[GitHub]"]'],
      valueResolver: p => p.githubUrl,
    },
    {
      key: 'portfolio',
      kind: 'url',
      label: /portfolio/i,
      selectors: ['input[name="urls[Portfolio]"]'],
      valueResolver: p => p.portfolioUrl,
    },
    {
      key: 'resume',
      kind: 'file',
      label: /resume/i,
      selectors: ['input[name="resume"]', 'input[type="file"][name*="resume" i]'],
      required: true,
    },
    {
      key: 'coverLetter',
      kind: 'textarea',
      label: /cover letter|additional information/i,
      selectors: ['textarea[name="comments"]', 'textarea[name*="cover" i]'],
      valueResolver: p => p.coverLetter,
    },
    {
      key: 'work_authorized',
      kind: 'yesno',
      label: /legally authorized|authorized to work/i,
      selectors: ['select[name*="authorized" i]', 'input[type="radio"][name*="authorized" i]'],
      optionResolver: (p, opts) => opts.find(o => /^yes/i.test(o.trim()) === visaAnswer('work_authorized', p)) ?? null,
    },
    {
      key: 'sponsorship',
      kind: 'yesno',
      label: /sponsorship/i,
      selectors: ['select[name*="sponsorship" i]', 'input[type="radio"][name*="sponsorship" i]'],
      optionResolver: (p, opts) => opts.find(o => /^yes/i.test(o.trim()) === visaAnswer('sponsorship', p)) ?? null,
    },
  ],

  submitSelector: 'button[type="submit"], button.template-btn-submit',
  successSelector: '.application-success, h1:has-text("Thank you")',
  humanRequiredSelectors: ['iframe[title*="recaptcha" i]', '.g-recaptcha'],
};
