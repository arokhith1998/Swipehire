import { describe, it, expect } from 'vitest';
import { recencySignal } from './recencySignal.js';
import type { ExtractedFeatures } from '../featureExtractor.js';

function makeFeatures(daysSincePosted: number | null): ExtractedFeatures {
  return { daysSincePosted } as any;
}

describe('recencySignal()', () => {
  it('returns ~1.0 for a brand-new posting (0 days)', async () => {
    const result = await recencySignal(makeFeatures(0));
    expect(result.value).toBeCloseTo(1.0, 2);
  });

  it('uses exponential decay with τ=14', async () => {
    const result = await recencySignal(makeFeatures(14));
    expect(result.value).toBeCloseTo(Math.exp(-1), 2);
  });

  it('returns low value for very old postings', async () => {
    const result = await recencySignal(makeFeatures(60));
    expect(result.value).toBeLessThan(0.1);
    expect(result.value).toBeGreaterThanOrEqual(0.05);
  });

  it('clamps minimum value at 0.05', async () => {
    const result = await recencySignal(makeFeatures(200));
    expect(result.value).toBe(0.05);
  });

  it('returns neutral 0.5 when posting date is unknown', async () => {
    const result = await recencySignal(makeFeatures(null));
    expect(result.value).toBe(0.5);
    expect(result.confidence).toBe(0.2);
  });
});
