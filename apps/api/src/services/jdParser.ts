/**
 * jdParser — extract structured fields from a raw job description using OpenAI.
 *
 * Output shape is the same regardless of source ATS (Greenhouse / Lever /
 * Ashby / Workday), so downstream scoring/matching can rely on a uniform
 * record instead of re-parsing the JD per scorer.
 *
 * Cached in-memory per (jobId, contentHash) for 24h — same JD doesn't get
 * re-parsed on every score. Persisted parses are future work (would live
 * in app.job_parses).
 */
import OpenAI from 'openai';
import crypto from 'node:crypto';

const MODEL = process.env.JD_PARSER_MODEL ?? 'gpt-4o-mini';
const CACHE_TTL_MS = 24 * 60 * 60_000;
const CACHE_MAX = 2000;

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not configured');
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

export interface ParsedJD {
  skills: string[];                                          // canonical, no duplicates
  requirements: string[];                                    // 3-6 short bullet phrases
  responsibilities: string[];                                // 3-6 short bullet phrases
  yearsOfExperience: { min: number | null; max: number | null };
  seniority: 'intern' | 'entry' | 'junior' | 'mid' | 'senior' | 'staff' | 'principal' | 'director' | 'unspecified';
  workMode: 'remote' | 'hybrid' | 'onsite' | 'unspecified';
  salaryBand: { min: number | null; max: number | null; currency: string | null; period: 'year' | 'hour' | 'unspecified' };
  visaSponsorship: 'yes' | 'no' | 'unclear';
  visaEvidence: string | null;                               // the literal JD phrase that drove the decision
  jobType: 'full-time' | 'part-time' | 'contract' | 'intern' | 'unspecified';
  domain: string | null;                                     // 'B2B SaaS', 'fintech', 'consumer marketplace', etc.
  parsedAt: string;
  modelVersion: string;
}

interface CacheEntry { storedAt: number; data: ParsedJD; }
const cache = new Map<string, CacheEntry>();
function pruneCache() {
  if (cache.size <= CACHE_MAX) return;
  const drop = Math.ceil(cache.size * 0.25);
  const oldest = [...cache.entries()].sort((a, b) => a[1].storedAt - b[1].storedAt);
  for (let i = 0; i < drop; i++) cache.delete(oldest[i][0]);
}
function cacheKey(jobId: number | string, contentHash: string): string {
  return `${jobId}|${contentHash}`;
}

const SYSTEM = `You parse job descriptions into a strict JSON object. Extract ONLY what the JD says. NEVER invent fields. If a field isn't stated, return the explicit null/'unspecified' value.

Output EXACTLY this shape — no markdown, no prose:
{
  "skills": ["..."],                                    // 10-25 canonical technologies/tools/methodologies mentioned
  "requirements": ["..."],                              // 3-6 short phrases (must-haves)
  "responsibilities": ["..."],                          // 3-6 short phrases (day-to-day)
  "yearsOfExperience": { "min": null, "max": null },   // numbers only, null when unstated
  "seniority": "intern|entry|junior|mid|senior|staff|principal|director|unspecified",
  "workMode": "remote|hybrid|onsite|unspecified",
  "salaryBand": { "min": null, "max": null, "currency": null, "period": "year|hour|unspecified" },
  "visaSponsorship": "yes|no|unclear",                  // yes=explicitly offered; no=explicitly excluded; unclear=silent
  "visaEvidence": null,                                 // the literal phrase from the JD that drove the visa decision; null if silent
  "jobType": "full-time|part-time|contract|intern|unspecified",
  "domain": null                                        // industry/vertical ('B2B SaaS', 'fintech', 'consumer marketplace', etc.) or null
}

Rules:
- Skills: only technologies/tools/methodologies (e.g. 'Python', 'SQL', 'RAG', 'A/B Testing', 'HubSpot'). Skip soft skills like 'communication' unless it's a specific framework ('SBI feedback model').
- Numbers in salaryBand are RAW integers (165000, not '165k'); period is 'year' or 'hour'.
- visaSponsorship='yes' requires explicit JD text ('we sponsor H-1B', 'visa sponsorship available'). 'no' requires explicit exclusion ('US citizens only', 'cannot sponsor'). Silent → 'unclear'.
- domain: be specific. 'consumer marketplace' beats 'tech'; 'B2B SaaS' beats 'SaaS'. Null if genuinely unclear.`;

export async function parseJD(args: {
  jobId: number | string;
  title: string;
  company: string;
  description: string;
}): Promise<ParsedJD> {
  const hash = crypto.createHash('sha256').update(args.description).digest('hex').slice(0, 16);
  const key = cacheKey(args.jobId, hash);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.storedAt < CACHE_TTL_MS) return hit.data;

  const r = await openai().chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `TITLE: ${args.title}\nCOMPANY: ${args.company}\n\nDESCRIPTION:\n${args.description.slice(0, 12000)}` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 1200,
  });
  const raw = r.choices[0]?.message?.content;
  if (!raw) throw new Error('empty response from openai');
  let parsed: any;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error('jdParser returned non-JSON: ' + raw.slice(0, 200)); }

  const out: ParsedJD = {
    skills: Array.isArray(parsed.skills) ? parsed.skills.slice(0, 30) : [],
    requirements: Array.isArray(parsed.requirements) ? parsed.requirements.slice(0, 8) : [],
    responsibilities: Array.isArray(parsed.responsibilities) ? parsed.responsibilities.slice(0, 8) : [],
    yearsOfExperience: {
      min: typeof parsed.yearsOfExperience?.min === 'number' ? parsed.yearsOfExperience.min : null,
      max: typeof parsed.yearsOfExperience?.max === 'number' ? parsed.yearsOfExperience.max : null,
    },
    seniority: ['intern','entry','junior','mid','senior','staff','principal','director'].includes(parsed.seniority)
      ? parsed.seniority : 'unspecified',
    workMode: ['remote','hybrid','onsite'].includes(parsed.workMode) ? parsed.workMode : 'unspecified',
    salaryBand: {
      min: typeof parsed.salaryBand?.min === 'number' ? parsed.salaryBand.min : null,
      max: typeof parsed.salaryBand?.max === 'number' ? parsed.salaryBand.max : null,
      currency: typeof parsed.salaryBand?.currency === 'string' ? parsed.salaryBand.currency : null,
      period: ['year','hour'].includes(parsed.salaryBand?.period) ? parsed.salaryBand.period : 'unspecified',
    },
    visaSponsorship: ['yes','no','unclear'].includes(parsed.visaSponsorship) ? parsed.visaSponsorship : 'unclear',
    visaEvidence: typeof parsed.visaEvidence === 'string' ? parsed.visaEvidence : null,
    jobType: ['full-time','part-time','contract','intern'].includes(parsed.jobType) ? parsed.jobType : 'unspecified',
    domain: typeof parsed.domain === 'string' && parsed.domain.length > 0 ? parsed.domain : null,
    parsedAt: new Date().toISOString(),
    modelVersion: MODEL,
  };
  cache.set(key, { storedAt: Date.now(), data: out });
  pruneCache();
  return out;
}
