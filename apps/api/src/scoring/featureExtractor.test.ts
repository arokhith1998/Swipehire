import { describe, it, expect } from 'vitest';
import { extractFeatures } from './featureExtractor.js';
import type { ScoringUser, ScoringJob } from './matcher.js';

function makeUser(overrides: Partial<ScoringUser> = {}): ScoringUser {
  return {
    id: 1,
    skills: ['Python', 'React', 'TypeScript'],
    preferredLocation: 'San Francisco, CA',
    remotePreference: 'remote',
    experience: '3 years',
    expectedSalary: '$140k',
    workAuthV2: { status: 'stem_opt', autoFillVisaQuestion: true },
    ...overrides,
  };
}

function makeJob(overrides: Partial<ScoringJob> = {}): ScoringJob {
  return {
    id: 100,
    title: 'Senior Software Engineer',
    company: 'Acme Corp',
    description: 'Build scalable systems with Python and TypeScript in our fintech platform.',
    requirements: ['Python', 'TypeScript', 'AWS', 'SQL'],
    location: 'San Francisco, CA',
    isRemote: false,
    salaryMin: 150000,
    salaryMax: 200000,
    createdAt: new Date('2026-05-01'),
    ...overrides,
  };
}

describe('extractFeatures()', () => {
  it('correctly identifies needsSponsorship for STEM-OPT user', async () => {
    const features = await extractFeatures(makeUser(), makeJob());
    expect(features.needsSponsorship).toBe(true);
  });

  it('does not need sponsorship for US citizen', async () => {
    const features = await extractFeatures(
      makeUser({ workAuthV2: { status: 'us_citizen', autoFillVisaQuestion: true } }),
      makeJob()
    );
    expect(features.needsSponsorship).toBe(false);
  });

  it('does not need sponsorship for green card holder', async () => {
    const features = await extractFeatures(
      makeUser({ workAuthV2: { status: 'green_card', autoFillVisaQuestion: true } }),
      makeJob()
    );
    expect(features.needsSponsorship).toBe(false);
  });

  it('extracts metro from San Francisco location', async () => {
    const features = await extractFeatures(makeUser(), makeJob());
    expect(features.jobMetro).toBe('SF Bay Area');
  });

  it('extracts metro from NYC location', async () => {
    const features = await extractFeatures(
      makeUser({ preferredLocation: 'New York, NY' }),
      makeJob({ location: 'New York, NY' })
    );
    expect(features.jobMetro).toBe('NYC Metro');
    expect(features.userMetros).toContain('NYC Metro');
  });

  it('extracts skills from JD text', async () => {
    const features = await extractFeatures(makeUser(), makeJob());
    expect(features.jdSkillsCanonical).toContain('Python');
    expect(features.jdSkillsCanonical).toContain('TypeScript');
    expect(features.jdSkillsCanonical).toContain('AWS');
    expect(features.jdSkillsCanonical).toContain('SQL');
  });

  it('computes daysSincePosted correctly', async () => {
    const oneDayAgo = new Date(Date.now() - 86_400_000);
    const features = await extractFeatures(makeUser(), makeJob({ createdAt: oneDayAgo }));
    expect(features.daysSincePosted).toBe(1);
  });

  it('handles null createdAt gracefully', async () => {
    const features = await extractFeatures(makeUser(), makeJob({ createdAt: null }));
    expect(features.daysSincePosted).toBeNull();
  });

  it('handles missing workAuth', async () => {
    const features = await extractFeatures(
      makeUser({ workAuthV2: undefined }),
      makeJob()
    );
    expect(features.needsSponsorship).toBe(false);
    expect(features.workAuth).toBeNull();
  });

  it('concatenates job fields into jdText', async () => {
    const features = await extractFeatures(makeUser(), makeJob());
    expect(features.jdText).toContain('Senior Software Engineer');
    expect(features.jdText).toContain('Build scalable systems');
    expect(features.jdText).toContain('Python');
  });

  it('resolves Remote metro for remote jobs', async () => {
    const features = await extractFeatures(
      makeUser({ preferredLocation: 'Remote' }),
      makeJob({ location: 'Remote' })
    );
    expect(features.jobMetro).toBe('Remote');
    expect(features.userMetros).toContain('Remote');
  });
});
