/**
 * Greenhouse spec — the canonical Tier 1 ATS.
 *
 * Forms have stable structure across ~10k Greenhouse customers. The selectors
 * here are the ones that hold up across the long tail of boards.
 */

import type { AtsSpec } from '../types.js';
import { classifyVisaQuestion, visaAnswer } from '../answers.js';

export const greenhouseSpec: AtsSpec = {
  ats: 'greenhouse',
  tier: 1,
  matches: (url, host) => host.includes('greenhouse.io') || host.includes('boards.greenhouse'),

  fields: [
    {
      key: 'firstName',
      kind: 'text',
      label: /first name/i,
      selectors: ['#first_name', 'input[autocomplete="given-name"]', 'input[name="first_name"]'],
      required: true,
      valueResolver: p => p.fullName.split(' ')[0],
    },
    {
      key: 'lastName',
      kind: 'text',
      label: /last name/i,
      selectors: ['#last_name', 'input[autocomplete="family-name"]', 'input[name="last_name"]'],
      required: true,
      valueResolver: p => p.fullName.split(' ').slice(1).join(' '),
    },
    {
      key: 'email',
      kind: 'email',
      label: /^email$/i,
      selectors: ['#email', 'input[type="email"]', 'input[name="email"]'],
      required: true,
      valueResolver: p => p.email,
    },
    {
      key: 'phone',
      kind: 'phone',
      label: /phone/i,
      selectors: ['#phone', 'input[type="tel"]', 'input[name="phone"]'],
      valueResolver: p => p.phone,
    },
    {
      key: 'location',
      kind: 'text',
      label: /location|city/i,
      selectors: ['#job_application_location', 'input[name="job_application[location]"]'],
      valueResolver: p => p.location,
    },
    {
      key: 'linkedin',
      kind: 'url',
      label: /linkedin/i,
      selectors: ['input[name*="linkedin" i]', 'input[id*="linkedin" i]'],
      valueResolver: p => p.linkedinUrl,
    },
    {
      key: 'portfolio',
      kind: 'url',
      label: /portfolio|website|github/i,
      selectors: ['input[name*="website" i]', 'input[id*="website" i]', 'input[name*="github" i]'],
      valueResolver: p => p.portfolioUrl ?? p.githubUrl,
    },
    {
      key: 'resume',
      kind: 'file',
      label: /resume|cv/i,
      selectors: ['input[type="file"][name*="resume" i]', '#resume', 'input[type="file"]'],
      required: true,
    },
    {
      key: 'coverLetter',
      kind: 'file',
      label: /cover letter/i,
      selectors: ['input[type="file"][name*="cover" i]', '#cover_letter'],
    },
    {
      key: 'work_authorized',
      kind: 'yesno',
      label: /authorized to work|legally authorized|work in the/i,
      selectors: ['select[name*="authorized" i]', 'fieldset:has(legend:matches("authorized"))'],
      optionResolver: (p, opts) => {
        const target = visaAnswer('work_authorized', p) ? /^yes/i : /^no/i;
        return opts.find(o => target.test(o.trim())) ?? null;
      },
    },
    {
      key: 'sponsorship',
      kind: 'yesno',
      label: /(require|need).*(visa|sponsorship)|sponsorship now or in the future/i,
      selectors: ['select[name*="sponsorship" i]', 'select[name*="visa" i]'],
      optionResolver: (p, opts) => {
        const target = visaAnswer('sponsorship', p) ? /^yes/i : /^no/i;
        return opts.find(o => target.test(o.trim())) ?? null;
      },
    },
  ],

  submitSelector: 'input[type="submit"], button[type="submit"]',
  successSelector: '.application-confirmation, [data-test="confirmation-message"]',
  humanRequiredSelectors: ['iframe[title*="recaptcha" i]', '.g-recaptcha', '[data-test="captcha"]'],
};
