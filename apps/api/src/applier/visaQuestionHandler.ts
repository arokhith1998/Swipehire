/**
 * Visa question handler — pre-fills the canonical pair of questions every
 * application asks. Logs every answer to audit.score_decisions for transparency.
 */

import type { WorkAuth } from '@swipehire/shared';
import {
  authorizedToWorkAnswer, sponsorshipAnswer, userNeedsSponsorship,
} from '@swipehire/shared';

export interface VisaAnswerSet {
  authorizedToWorkInUS: boolean;
  willRequireSponsorship: boolean;
  visaStatusForApplication: string | null;  // human-readable for "what is your visa status?"
  notes: string[];                          // for audit log
}

export function generateVisaAnswers(workAuth: WorkAuth | null | undefined): VisaAnswerSet {
  const authorized = authorizedToWorkAnswer(workAuth);
  const sponsorship = sponsorshipAnswer(workAuth);

  let visaLabel: string | null = null;
  if (workAuth) {
    visaLabel = humanizeStatus(workAuth);
  }

  const notes: string[] = [];
  if (workAuth) {
    notes.push(`Pre-filled based on user.work_auth_v2.status='${workAuth.status}'`);
    if (workAuth.expiresAt) notes.push(`User EAD/visa expires ${workAuth.expiresAt}`);
    if (workAuth.sponsorshipNeededWithinMonths != null) {
      notes.push(`Sponsorship needed within ${workAuth.sponsorshipNeededWithinMonths} months`);
    }
  } else {
    notes.push('No work_auth_v2 set — defaulted authorized=false, sponsor=false');
  }

  return {
    authorizedToWorkInUS: authorized,
    willRequireSponsorship: sponsorship,
    visaStatusForApplication: visaLabel,
    notes,
  };
}

function humanizeStatus(workAuth: WorkAuth): string {
  const map: Record<string, string> = {
    us_citizen: 'U.S. Citizen',
    green_card: 'Permanent Resident (Green Card)',
    h1b: 'H-1B (will require transfer)',
    h4_ead: 'H-4 EAD',
    l1: 'L-1',
    l2_ead: 'L-2 EAD',
    opt: 'F-1 OPT',
    stem_opt: 'F-1 STEM OPT',
    cpt: 'F-1 CPT',
    e3: 'E-3 (Australia)',
    tn: 'TN (Canada/Mexico)',
    h1b1: 'H-1B1 (Chile/Singapore)',
    o1: 'O-1',
    j1: 'J-1',
    asylum_ead: 'Asylum-based EAD',
    other: 'Other (will explain)',
  };
  return map[workAuth.status] ?? workAuth.status;
}
