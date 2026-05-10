/**
 * Answer generation — converts a Profile into the answers a form expects.
 * Environment-agnostic.
 */

import type { Profile, FieldSpec } from './types.js';

/** Resolve the value to fill into a given field for a given profile. */
export function resolveFieldValue(field: FieldSpec, profile: Profile, optionsAvailable?: string[]): string | undefined {
  if (field.valueResolver) {
    return field.valueResolver(profile);
  }
  if (field.optionResolver && optionsAvailable) {
    return field.optionResolver(profile, optionsAvailable) ?? undefined;
  }
  // Fall back: try common keys
  switch (field.key) {
    case 'firstName': return profile.fullName.split(' ')[0];
    case 'lastName':  return profile.fullName.split(' ').slice(1).join(' ');
    case 'fullName':  return profile.fullName;
    case 'email':     return profile.email;
    case 'phone':     return profile.phone;
    case 'location':  return profile.location;
    case 'linkedin':  return profile.linkedinUrl;
    case 'github':    return profile.githubUrl;
    case 'portfolio': return profile.portfolioUrl ?? profile.githubUrl;
    case 'salaryExpectation': return profile.salaryExpectation;
    case 'yearsOfExperience': return profile.yearsOfExperience?.toString();
    case 'coverLetter': return profile.coverLetter;
    default:
      return profile.customAnswers?.[field.key];
  }
}

/**
 * Visa-related question detection — works across phrasings.
 * Returns the normalized question type, if it's a visa Q.
 */
export function classifyVisaQuestion(label: string): 'work_authorized' | 'sponsorship' | null {
  const l = label.toLowerCase();
  if (/legally authorized|right to work|work in the (us|united states|u\.s\.)\b|currently authorized/.test(l)) {
    return 'work_authorized';
  }
  if (/(require|need).*(visa|sponsorship|h.?1.?b)|will you require|sponsorship now or in the future/.test(l)) {
    return 'sponsorship';
  }
  return null;
}

/** Yes/No answer for visa questions, derived from profile. */
export function visaAnswer(question: 'work_authorized' | 'sponsorship', profile: Profile): boolean {
  return question === 'work_authorized' ? profile.workAuthorized : profile.requiresSponsorship;
}
