import { describe, it, expect } from 'vitest';
import { locationFit } from './locationFit.js';
import type { ExtractedFeatures } from '../featureExtractor.js';

function makeFeatures(overrides: Partial<ExtractedFeatures> = {}): ExtractedFeatures {
  return {
    user: { id: 1, remotePreference: 'remote' } as any,
    job: { id: 100, isRemote: false, isHybrid: false } as any,
    workAuth: null,
    needsSponsorship: false,
    userTargetSocs: [],
    userTargetRoleFamilies: [],
    jobSocCode: null,
    jobRoleFamily: null,
    roleFamilyId: null,
    jobMetro: 'SF Bay Area',
    userMetros: ['SF Bay Area'],
    resumeText: '',
    jdText: '',
    parsedRequirements: [],
    userSkillsCanonical: [],
    jdSkillsCanonical: [],
    employerFein: null,
    daysSincePosted: 3,
    ...overrides,
  };
}

describe('locationFit()', () => {
  it('returns 1.0 for remote job when user prefers remote', async () => {
    const result = await locationFit(makeFeatures({
      job: { id: 1, isRemote: true } as any,
      user: { id: 1, remotePreference: 'remote' } as any,
    }));
    expect(result.value).toBe(1.0);
    expect(result.confidence).toBe(1.0);
  });

  it('returns 1.0 when job and user are in same metro', async () => {
    const result = await locationFit(makeFeatures({
      user: { id: 1, remotePreference: 'onsite' } as any,
      jobMetro: 'NYC Metro',
      userMetros: ['NYC Metro'],
    }));
    expect(result.value).toBe(1.0);
  });

  it('returns 0.2 when metros differ', async () => {
    const result = await locationFit(makeFeatures({
      user: { id: 1, remotePreference: 'onsite' } as any,
      jobMetro: 'Chicago Metro',
      userMetros: ['SF Bay Area'],
    }));
    expect(result.value).toBe(0.2);
  });

  it('returns 0.4 when location data is missing', async () => {
    const result = await locationFit(makeFeatures({
      user: { id: 1, remotePreference: 'onsite' } as any,
      jobMetro: null,
      userMetros: [],
    }));
    expect(result.value).toBe(0.4);
    expect(result.confidence).toBe(0.4);
  });

  it('returns 0.92 for hybrid job when user is ok with hybrid and in same metro', async () => {
    const result = await locationFit(makeFeatures({
      user: { id: 1, remotePreference: 'hybrid' } as any,
      job: { id: 1, isRemote: false, isHybrid: true } as any,
      jobMetro: 'SF Bay Area',
      userMetros: ['SF Bay Area'],
    }));
    expect(result.value).toBe(0.92);
  });

  it('handles "Anywhere in US" wildcard for any US metro', async () => {
    const result = await locationFit(makeFeatures({
      user: { id: 1, remotePreference: 'remote,hybrid,onsite' } as any,
      jobMetro: 'Austin Metro',
      userMetros: ['Anywhere in US'],
    }));
    expect(result.value).toBe(1.0);
  });

  it('handles multi-metro user preferences', async () => {
    const result = await locationFit(makeFeatures({
      user: { id: 1, remotePreference: 'hybrid,onsite' } as any,
      jobMetro: 'NYC Metro',
      userMetros: ['SF Bay Area', 'NYC Metro', 'Austin Metro'],
    }));
    expect(result.value).toBe(1.0);
  });

  it('multi-mode preference: remote+hybrid both accepted', async () => {
    const result = await locationFit(makeFeatures({
      user: { id: 1, remotePreference: 'remote,hybrid' } as any,
      job: { id: 1, isRemote: true, isHybrid: false } as any,
      jobMetro: 'Remote',
      userMetros: ['SF Bay Area', 'Remote'],
    }));
    expect(result.value).toBe(1.0);
  });
});
