import { describe, it, expect } from 'vitest';
import { combine } from './combiner.js';
import type { Subscore, SubscoreKey } from '@swipehire/shared';

function makeSub(value: number, confidence = 1): Subscore {
  return { value, weight: 0, confidence, evidence: [] };
}

function makeSubscores(overrides: Partial<Record<SubscoreKey, Subscore>> = {}): Record<SubscoreKey, Subscore> {
  return {
    skillsSemantic: makeSub(0.8),
    titleAlignment: makeSub(0.7),
    seniorityFit: makeSub(0.6),
    locationFit: makeSub(0.9),
    domainExperience: makeSub(0.5),
    visaCompatibility: makeSub(0.7),
    salaryFit: makeSub(0.8),
    recencySignal: makeSub(0.9),
    ...overrides,
  };
}

describe('combine()', () => {
  it('produces a raw score in [0,1] given uniform subscores', () => {
    const subscores = makeSubscores();
    const { raw } = combine(subscores, null);
    expect(raw).toBeGreaterThanOrEqual(0);
    expect(raw).toBeLessThanOrEqual(1);
  });

  it('returns 1.0 when all subscores are 1.0', () => {
    const subscores = makeSubscores({
      skillsSemantic: makeSub(1),
      titleAlignment: makeSub(1),
      seniorityFit: makeSub(1),
      locationFit: makeSub(1),
      domainExperience: makeSub(1),
      visaCompatibility: makeSub(1),
      salaryFit: makeSub(1),
      recencySignal: makeSub(1),
    });
    const { raw } = combine(subscores, null);
    expect(raw).toBeCloseTo(1.0, 5);
  });

  it('returns 0.0 when all subscores are 0.0', () => {
    const subscores = makeSubscores({
      skillsSemantic: makeSub(0),
      titleAlignment: makeSub(0),
      seniorityFit: makeSub(0),
      locationFit: makeSub(0),
      domainExperience: makeSub(0),
      visaCompatibility: makeSub(0),
      salaryFit: makeSub(0),
      recencySignal: makeSub(0),
    });
    const { raw } = combine(subscores, null);
    expect(raw).toBeCloseTo(0.0, 5);
  });

  it('redistributes weight when a subscore has confidence=0', () => {
    const subscores = makeSubscores({
      salaryFit: makeSub(0.5, 0),
    });
    const { raw, weights } = combine(subscores, null);
    expect(weights.salaryFit).toBe(0);
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(totalWeight).toBeCloseTo(1.0, 5);
    expect(raw).toBeGreaterThan(0);
  });

  it('handles all subscores having confidence=0 without crashing', () => {
    const subscores = makeSubscores({
      skillsSemantic: makeSub(0.5, 0),
      titleAlignment: makeSub(0.5, 0),
      seniorityFit: makeSub(0.5, 0),
      locationFit: makeSub(0.5, 0),
      domainExperience: makeSub(0.5, 0),
      visaCompatibility: makeSub(0.5, 0),
      salaryFit: makeSub(0.5, 0),
      recencySignal: makeSub(0.5, 0),
    });
    const { raw } = combine(subscores, null);
    expect(raw).toBe(0);
  });

  it('skillsSemantic has the highest default weight', () => {
    const subscores = makeSubscores();
    const { weights } = combine(subscores, null);
    const maxKey = (Object.keys(weights) as SubscoreKey[]).reduce((a, b) =>
      weights[a] > weights[b] ? a : b
    );
    expect(maxKey).toBe('skillsSemantic');
  });

  it('default weights sum to 1.0', () => {
    const subscores = makeSubscores();
    const { weights } = combine(subscores, null);
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1.0, 5);
  });
});
