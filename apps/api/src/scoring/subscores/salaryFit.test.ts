import { describe, it, expect } from 'vitest';
import { salaryFit } from './salaryFit.js';
import type { ExtractedFeatures } from '../featureExtractor.js';

function makeFeatures(expectedSalary: string | null, salaryMin: number | null, salaryMax: number | null): ExtractedFeatures {
  return {
    user: { id: 1, expectedSalary },
    job: { id: 100, salaryMin, salaryMax },
  } as any;
}

describe('salaryFit()', () => {
  it('returns confidence=0 when salary data is missing on user side', async () => {
    const result = await salaryFit(makeFeatures(null, 100000, 150000));
    expect(result.confidence).toBe(0);
    expect(result.value).toBe(0.5);
  });

  it('returns confidence=0 when salary data is missing on job side', async () => {
    const result = await salaryFit(makeFeatures('$140k', null, null));
    expect(result.confidence).toBe(0);
    expect(result.value).toBe(0.5);
  });

  it('returns 1.0 when expected salary is within the band', async () => {
    const result = await salaryFit(makeFeatures('$140k', 120000, 160000));
    expect(result.value).toBe(1.0);
    expect(result.confidence).toBe(0.95);
  });

  it('returns 0.75 for small drift (≤15%)', async () => {
    // band 150k-160k, mid=155k, expected=170k → drift=15k/155k ≈ 9.7%
    const result = await salaryFit(makeFeatures('$170k', 150000, 160000));
    expect(result.value).toBe(0.75);
  });

  it('returns 0.4 for moderate drift (15-30%)', async () => {
    // mid = 150k, expected = 120k → drift = 30k/150k = 20%
    const result = await salaryFit(makeFeatures('$120k', 140000, 160000));
    expect(result.value).toBe(0.4);
  });

  it('returns 0.1 for large drift (>30%)', async () => {
    // mid = 150k, expected = 100k → drift = 50k/150k ≈ 33%
    const result = await salaryFit(makeFeatures('$100k', 140000, 160000));
    expect(result.value).toBe(0.1);
  });

  it('parses "$150,000" format correctly', async () => {
    const result = await salaryFit(makeFeatures('$150,000', 140000, 160000));
    expect(result.value).toBe(1.0);
  });

  it('parses "$140k–$180k" format (takes max)', async () => {
    const result = await salaryFit(makeFeatures('$140k–$180k', 150000, 200000));
    expect(result.value).toBe(1.0);
  });
});
