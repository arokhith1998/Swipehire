import { describe, it, expect } from 'vitest';
import { titleAlignment } from './titleAlignment.js';
import type { ExtractedFeatures } from '../featureExtractor.js';

function makeFeatures(jobTitle: string, targetFamilies: string[]): ExtractedFeatures {
  return {
    job: { id: 100, title: jobTitle },
    userTargetRoleFamilies: targetFamilies,
  } as any;
}

describe('titleAlignment()', () => {
  it('returns 1.0 when job title contains the target family', async () => {
    const result = await titleAlignment(makeFeatures('Software Engineer', ['software engineer']));
    expect(result.value).toBe(1.0);
  });

  it('returns 1.0 when target family contains the job title', async () => {
    const result = await titleAlignment(makeFeatures('Data Analyst', ['data analyst']));
    expect(result.value).toBe(1.0);
  });

  it('returns 0.7 for high token overlap (Jaccard ≥ 0.5)', async () => {
    // tokens: {frontend, react, engineer} vs {frontend, engineer}, intersect=2, union=3, jaccard=0.67
    const result = await titleAlignment(makeFeatures('Frontend React Engineer', ['frontend engineer']));
    expect(result.value).toBe(0.7);
  });

  it('returns 0.1 for unrelated titles', async () => {
    const result = await titleAlignment(makeFeatures('Marketing Manager', ['software engineer']));
    expect(result.value).toBe(0.1);
  });

  it('returns 0.5 with low confidence when user has no target families', async () => {
    const result = await titleAlignment(makeFeatures('Software Engineer', []));
    expect(result.value).toBe(0.5);
    expect(result.confidence).toBe(0.3);
  });

  it('picks the best match from multiple target families', async () => {
    const result = await titleAlignment(
      makeFeatures('Data Scientist', ['software engineer', 'data scientist', 'product manager'])
    );
    expect(result.value).toBe(1.0);
  });
});
