import { describe, it, expect, vi } from 'vitest';
import type { Subscore, SubscoreKey } from '@swipehire/shared';

vi.mock('../ml/inferenceClient.js', () => ({
  score: vi.fn().mockResolvedValue({
    probability: 0.72,
    ci_low: 0.62,
    ci_high: 0.82,
    model_version: 'test-v1',
  }),
}));

import { calibrate } from './calibrator.js';

function makeSub(value: number, confidence: number, weight = 0.1): Subscore {
  return { value, weight, confidence, evidence: [] };
}

function makeSubscores(confidence = 0.8): Record<SubscoreKey, Subscore> {
  return {
    skillsSemantic: makeSub(0.8, confidence),
    titleAlignment: makeSub(0.7, confidence),
    seniorityFit: makeSub(0.6, confidence),
    locationFit: makeSub(0.9, confidence),
    domainExperience: makeSub(0.5, confidence),
    visaCompatibility: makeSub(0.7, confidence),
    salaryFit: makeSub(0.8, confidence),
    recencySignal: makeSub(0.9, confidence),
  };
}

describe('calibrate()', () => {
  it('returns "Insufficient data" when avg confidence < 0.4', async () => {
    const result = await calibrate({
      raw: 0.8,
      subscores: makeSubscores(0.2),
      roleFamilyId: null,
    });
    expect(result.label).toBe('Insufficient data');
    expect(result.interviewProbability).toBeNull();
    expect(result.confidenceInterval).toBeNull();
    expect(result.modelVersion).toBe('pre-calibration-gate');
  });

  it('calls ML sidecar and returns calibrated result when confidence is sufficient', async () => {
    const result = await calibrate({
      raw: 0.75,
      subscores: makeSubscores(0.9),
      roleFamilyId: null,
    });
    expect(result.interviewProbability).toBe(0.72);
    expect(result.confidenceInterval).toEqual([0.62, 0.82]);
    expect(result.modelVersion).toBe('test-v1');
    expect(result.label).toBe('Strong fit');
  });

  it('uses identity fallback when ML sidecar fails', async () => {
    const { score } = await import('../ml/inferenceClient.js');
    (score as any).mockRejectedValueOnce(new Error('sidecar down'));

    const result = await calibrate({
      raw: 0.60,
      subscores: makeSubscores(0.8),
      roleFamilyId: null,
    });
    expect(result.interviewProbability).toBe(0.60);
    expect(result.modelVersion).toBe('fallback-identity');
    expect(result.confidenceInterval![1] - result.confidenceInterval![0]).toBeCloseTo(0.40);
  });

  it('label logic: wide CI → Insufficient data even if probability is high', async () => {
    const { score } = await import('../ml/inferenceClient.js');
    (score as any).mockResolvedValueOnce({
      probability: 0.85,
      ci_low: 0.30,
      ci_high: 0.95,
      model_version: 'test-wide',
    });

    const result = await calibrate({
      raw: 0.85,
      subscores: makeSubscores(0.9),
      roleFamilyId: null,
    });
    expect(result.label).toBe('Insufficient data');
  });

  it('label logic: "Promising fit" for mid-probability narrow CI', async () => {
    const { score } = await import('../ml/inferenceClient.js');
    (score as any).mockResolvedValueOnce({
      probability: 0.60,
      ci_low: 0.50,
      ci_high: 0.70,
      model_version: 'test-promising',
    });

    const result = await calibrate({
      raw: 0.60,
      subscores: makeSubscores(0.9),
      roleFamilyId: null,
    });
    expect(result.label).toBe('Promising fit');
  });

  it('label logic: "Weak fit" for low probability', async () => {
    const { score } = await import('../ml/inferenceClient.js');
    (score as any).mockResolvedValueOnce({
      probability: 0.20,
      ci_low: 0.10,
      ci_high: 0.30,
      model_version: 'test-weak',
    });

    const result = await calibrate({
      raw: 0.20,
      subscores: makeSubscores(0.9),
      roleFamilyId: null,
    });
    expect(result.label).toBe('Weak fit');
  });

  it('only considers subscores with weight > 0 for avg confidence', async () => {
    const subscores = makeSubscores(0.9);
    subscores.salaryFit = { value: 0.5, weight: 0, confidence: 0, evidence: [] };
    subscores.recencySignal = { value: 0.5, weight: 0, confidence: 0, evidence: [] };

    const result = await calibrate({
      raw: 0.7,
      subscores,
      roleFamilyId: null,
    });
    expect(result.label).not.toBe('Insufficient data');
  });
});
