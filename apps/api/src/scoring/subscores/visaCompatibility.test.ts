import { describe, it, expect, vi } from 'vitest';

vi.mock('../../visa/compatibility.js', () => ({
  calculateVisaCompatibility: vi.fn().mockResolvedValue({
    value: 0.75, weight: 0, confidence: 0.8, evidence: ['Employer sponsors'],
  }),
}));

import { visaCompatibility } from './visaCompatibility.js';
import type { ExtractedFeatures } from '../featureExtractor.js';

function makeFeatures(needsSponsorship: boolean): ExtractedFeatures {
  return {
    needsSponsorship,
    user: { id: 1 },
    job: { id: 100, company: 'Acme' },
  } as any;
}

describe('visaCompatibility()', () => {
  it('returns 1.0 with confidence 1 when user does not need sponsorship', async () => {
    const result = await visaCompatibility(makeFeatures(false));
    expect(result.value).toBe(1);
    expect(result.confidence).toBe(1);
    expect(result.evidence).toContain('Not applicable — user does not need sponsorship');
  });

  it('delegates to calculateVisaCompatibility when user needs sponsorship', async () => {
    const result = await visaCompatibility(makeFeatures(true));
    expect(result.value).toBe(0.75);
    expect(result.confidence).toBe(0.8);
  });
});
