import { describe, it, expect } from 'vitest';
import { seniorityFit } from './seniorityFit.js';
import type { ExtractedFeatures } from '../featureExtractor.js';

function makeFeatures(userExperience: string, jobTitle: string, jobDesc = ''): ExtractedFeatures {
  return {
    user: { id: 1, experience: userExperience },
    job: { id: 100, title: jobTitle, description: jobDesc },
  } as any;
}

describe('seniorityFit()', () => {
  it('returns 1.0 for exact level match', async () => {
    const result = await seniorityFit(makeFeatures('Senior engineer', 'Senior Software Engineer'));
    expect(result.value).toBe(1.0);
  });

  it('returns 0.85 for slightly overqualified (+1)', async () => {
    const result = await seniorityFit(makeFeatures('Senior developer', 'Mid-level Engineer'));
    expect(result.value).toBe(0.85);
  });

  it('returns 0.7 for slightly underqualified (-1)', async () => {
    const result = await seniorityFit(makeFeatures('Mid-level developer', 'Senior Engineer'));
    expect(result.value).toBe(0.7);
  });

  it('returns 0.5 when levels cannot be inferred', async () => {
    const result = await seniorityFit(makeFeatures('did stuff', 'Engineer'));
    expect(result.value).toBe(0.5);
    expect(result.confidence).toBe(0.3);
  });

  it('penalizes underqualified more than overqualified', async () => {
    const over = await seniorityFit(makeFeatures('Staff engineer', 'Senior Engineer'));
    const under = await seniorityFit(makeFeatures('Junior developer', 'Mid-level Engineer'));
    expect(over.value).toBeGreaterThan(under.value);
  });

  it('detects intern level', async () => {
    const result = await seniorityFit(makeFeatures('Intern at Google', 'Internship - Software'));
    expect(result.value).toBe(1.0);
  });

  it('handles director vs entry with low score', async () => {
    const result = await seniorityFit(makeFeatures('Director of Engineering', 'Entry-level developer'));
    expect(result.value).toBe(0.1);
  });
});
