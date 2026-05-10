import { describe, it, expect } from 'vitest';
import { buildExplain } from './explain.js';
import type { Subscore, SubscoreKey } from '@swipehire/shared';

function makeSub(value: number, weight: number, evidence: string[] = []): Subscore {
  return { value, weight, confidence: 0.9, evidence };
}

describe('buildExplain()', () => {
  it('picks top reasons to apply from subscores with value ≥ 0.7 and weight > 0', () => {
    const subscores: Record<SubscoreKey, Subscore> = {
      skillsSemantic: makeSub(0.9, 0.30, ['Matched 8/10 skills']),
      titleAlignment: makeSub(0.8, 0.18, ['Title aligns well']),
      seniorityFit: makeSub(0.3, 0.12, ['Underqualified']),
      locationFit: makeSub(0.95, 0.10, ['Same metro']),
      domainExperience: makeSub(0.2, 0.08, ['No domain match']),
      visaCompatibility: makeSub(0.6, 0.10, ['Company sponsors sometimes']),
      salaryFit: makeSub(0.5, 0.06, ['Salary ok']),
      recencySignal: makeSub(0.9, 0.06, ['Posted 2d ago']),
    };

    const result = buildExplain({
      user: {} as any,
      job: {} as any,
      features: { jdSkillsCanonical: ['Python', 'Go'], userSkillsCanonical: ['Python'] } as any,
      subscores,
      calibration: { interviewProbability: 0.7, confidenceInterval: [0.6, 0.8], label: 'Strong fit', modelVersion: 'v1' },
      durationMs: 100,
    });

    expect(result.topReasonsToApply.length).toBeGreaterThan(0);
    expect(result.topReasonsToApply.length).toBeLessThanOrEqual(3);
    expect(result.topReasonsToApply[0]).toBe('Matched 8/10 skills');
  });

  it('picks top reasons to hesitate from subscores with value ≤ 0.4 and weight > 0.05', () => {
    const subscores: Record<SubscoreKey, Subscore> = {
      skillsSemantic: makeSub(0.9, 0.30, ['Great skills']),
      titleAlignment: makeSub(0.8, 0.18, ['Good title']),
      seniorityFit: makeSub(0.2, 0.12, ['Very underqualified']),
      locationFit: makeSub(0.1, 0.10, ['Wrong city']),
      domainExperience: makeSub(0.3, 0.08, ['No domain match']),
      visaCompatibility: makeSub(0.6, 0.10, ['Company sponsors']),
      salaryFit: makeSub(0.5, 0.06, ['Ok salary']),
      recencySignal: makeSub(0.9, 0.06, ['Fresh']),
    };

    const result = buildExplain({
      user: {} as any,
      job: {} as any,
      features: { jdSkillsCanonical: [], userSkillsCanonical: [] } as any,
      subscores,
      calibration: { interviewProbability: 0.5, confidenceInterval: [0.4, 0.6], label: 'Stretch', modelVersion: 'v1' },
      durationMs: 50,
    });

    expect(result.topReasonsToHesitate.length).toBeGreaterThan(0);
    expect(result.topReasonsToHesitate.length).toBeLessThanOrEqual(3);
  });

  it('identifies missing evidence (skills in JD not in user)', () => {
    const subscores: Record<SubscoreKey, Subscore> = {
      skillsSemantic: makeSub(0.5, 0.30),
      titleAlignment: makeSub(0.5, 0.18),
      seniorityFit: makeSub(0.5, 0.12),
      locationFit: makeSub(0.5, 0.10),
      domainExperience: makeSub(0.5, 0.08),
      visaCompatibility: makeSub(0.5, 0.10),
      salaryFit: makeSub(0.5, 0.06),
      recencySignal: makeSub(0.5, 0.06),
    };

    const result = buildExplain({
      user: {} as any,
      job: {} as any,
      features: {
        jdSkillsCanonical: ['Python', 'Go', 'Kubernetes'],
        userSkillsCanonical: ['Python'],
      } as any,
      subscores,
      calibration: { interviewProbability: 0.5, confidenceInterval: [0.4, 0.6], label: 'Stretch', modelVersion: 'v1' },
      durationMs: 50,
    });

    expect(result.missingEvidence).toContain('Go');
    expect(result.missingEvidence).toContain('Kubernetes');
    expect(result.missingEvidence).not.toContain('Python');
  });
});
