import { describe, it, expect } from 'vitest';
import { domainExperience } from './domainExperience.js';
import type { ExtractedFeatures } from '../featureExtractor.js';

function makeFeatures(jdText: string, resumeText: string): ExtractedFeatures {
  return { jdText, resumeText } as any;
}

describe('domainExperience()', () => {
  it('returns 1.0 when all JD verticals are in resume', async () => {
    const result = await domainExperience(makeFeatures(
      'We are a fintech company building e-commerce solutions',
      'Worked at a fintech startup building e-commerce products'
    ));
    expect(result.value).toBe(1.0);
  });

  it('returns 0 when JD verticals are absent from resume', async () => {
    const result = await domainExperience(makeFeatures(
      'We are a fintech company',
      'Worked in healthcare and gaming'
    ));
    expect(result.value).toBe(0);
  });

  it('returns 0.5 when JD has no recognizable vertical', async () => {
    const result = await domainExperience(makeFeatures(
      'We build software for startups',
      'Senior engineer with extensive background'
    ));
    expect(result.value).toBe(0.5);
    expect(result.confidence).toBe(0.2);
  });

  it('handles partial overlap (1 of 2 verticals matched)', async () => {
    const result = await domainExperience(makeFeatures(
      'Our fintech and gaming platform',
      'Five years in fintech only'
    ));
    expect(result.value).toBe(0.5);
  });
});
