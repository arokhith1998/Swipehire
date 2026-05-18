/**
 * matchExplainer — natural-language "why this match" via OpenAI.
 *
 * The existing src/scoring/explain.ts produces templated bullet strings
 * ("Matched 8/10 JD skills...", "Job is hybrid; user prefers hybrid")
 * which are accurate but read like a debug log. This service runs those
 * facts through gpt-4o-mini to produce 2-3 conversational sentences a
 * candidate would actually read.
 *
 * Cached per (jobId, userId, matchScore) for 30 min — re-asking the same
 * question is free.
 */
import OpenAI from 'openai';
import type { MatchResult } from '@swipehire/shared';

const MODEL = process.env.EXPLAINER_MODEL ?? 'gpt-4o-mini';
const CACHE_TTL_MS = 30 * 60_000;
const CACHE_MAX = 4000;

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not configured');
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

export interface ExplainerInput {
  jobId: number;
  userId: number;
  job: {
    title: string;
    company: string;
    location: string | null;
    isRemote: boolean | null;
    isHybrid: boolean | null;
    salaryMin: number | null;
    salaryMax: number | null;
    sponsorsVisa: boolean | null;
    description: string;
  };
  user: {
    targetJobTitle: string | null;
    preferredLocation: string | null;
    remotePreference: string | null;
    visaStatus: string | null;
    experience: string | null;
    expectedSalary: string | null;
    skills: string[] | null;
  };
  match: MatchResult;
}

export interface ExplainerOutput {
  verdict: 'strong' | 'promising' | 'stretch' | 'weak';
  oneLiner: string;            // 1-sentence headline verdict
  whyApply: string[];          // 2-4 concrete reasons rooted in the data
  whatToWatch: string[];       // 1-3 concrete risks or unknowns
  modelVersion: string;
}

interface CacheEntry { storedAt: number; data: ExplainerOutput; }
const cache = new Map<string, CacheEntry>();
function pruneCache() {
  if (cache.size <= CACHE_MAX) return;
  const drop = Math.ceil(cache.size * 0.25);
  const oldest = [...cache.entries()].sort((a, b) => a[1].storedAt - b[1].storedAt);
  for (let i = 0; i < drop; i++) cache.delete(oldest[i][0]);
}

const SYSTEM = `You are SwipeHire's match explainer. Given a candidate profile, a job, and the matcher's structured scores+evidence, you produce a short JSON object the UI renders as a 'Why apply' card.

Output EXACTLY:
{
  "verdict": "strong|promising|stretch|weak",
  "oneLiner": "...",                  // 1 sentence, ≤22 words, plain language, no jargon
  "whyApply": ["...", "..."],         // 2-4 bullets, each ≤18 words, grounded in the data you were given
  "whatToWatch": ["...", "..."]       // 1-3 bullets, each ≤18 words, honest about risks
}

Rules:
- The candidate is reading this on a job card. Be direct, no fluff, no 'leverage your synergistic experience' nonsense.
- Each bullet must cite something concrete from the inputs (a subscore name, a specific skill match, the user's visa status, the salary delta).
- If a subscore is low (locationFit, salaryFit, etc.), the bullet should name it as a risk in whatToWatch, not hide it.
- Pull from match.subscores.evidence when phrasing — those evidence strings are pre-validated facts you can trust.
- NEVER invent metrics. If the user has no LCA history for the company in match.visaIntel, say 'no DOL records on file' instead of guessing.
- whyApply: positive signals. whatToWatch: gaps, risks, missing info. If a 'whatToWatch' is unavoidable (e.g. user is F-1, company doesn't sponsor), it goes here.
- 'verdict' should align with match.label: Strong fit → 'strong'; Promising fit → 'promising'; Stretch → 'stretch'; everything else (Weak fit, Insufficient data) → 'weak'.`;

function buildContext(input: ExplainerInput): string {
  const j = input.job;
  const u = input.user;
  const m = input.match;
  const subBlock = Object.entries(m.subscores).map(([k, s]: [string, any]) => {
    const ev = (s.evidence ?? []).slice(0, 2).join(' / ');
    return `  ${k}: value=${(s.value ?? 0).toFixed(2)} weight=${(s.weight ?? 0).toFixed(2)} ${ev ? `evidence="${ev}"` : ''}`;
  }).join('\n');
  const vi = m.visaIntel as any;
  const visaIntel = vi
    ? `Visa intel: ${vi.totalLcas24mo ?? 0} LCAs (24mo), certification ${vi.certificationRate24mo != null ? Math.round(vi.certificationRate24mo * 100) + '%' : 'unknown'}.`
    : 'Visa intel: no DOL records.';
  return `JOB:
  title="${j.title}" company="${j.company}" location="${j.location ?? ''}"
  remote=${j.isRemote} hybrid=${j.isHybrid} sponsorsVisa=${j.sponsorsVisa}
  salary=${j.salaryMin ?? 'null'}–${j.salaryMax ?? 'null'}

USER:
  targetRole="${u.targetJobTitle ?? ''}" location="${u.preferredLocation ?? ''}"
  remotePref="${u.remotePreference ?? ''}" visa="${u.visaStatus ?? ''}"
  experience="${u.experience ?? ''}" expectedSalary="${u.expectedSalary ?? ''}"
  skills=${(u.skills ?? []).slice(0, 30).join(', ')}

MATCH:
  label="${m.label}" interviewProbability=${m.interviewProbability ?? 'null'} ci=${JSON.stringify(m.confidenceInterval ?? null)}
  ${visaIntel}
  subscores:
${subBlock}`;
}

export async function explainMatch(input: ExplainerInput): Promise<ExplainerOutput> {
  const scoreBucket = Math.round((input.match.interviewProbability ?? 0) * 20); // bucket at 5% to invalidate cache on meaningful changes
  const key = `${input.jobId}|${input.userId}|${input.match.label}|${scoreBucket}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.storedAt < CACHE_TTL_MS) return hit.data;

  const r = await openai().chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: buildContext(input) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 500,
  });
  const raw = r.choices[0]?.message?.content;
  if (!raw) throw new Error('empty response from openai');
  let parsed: any;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error('explainer returned non-JSON: ' + raw.slice(0, 200)); }

  const verdict = (['strong','promising','stretch','weak'] as const).includes(parsed.verdict) ? parsed.verdict : 'weak';
  const out: ExplainerOutput = {
    verdict,
    oneLiner: typeof parsed.oneLiner === 'string' ? parsed.oneLiner : '',
    whyApply: Array.isArray(parsed.whyApply) ? parsed.whyApply.slice(0, 4) : [],
    whatToWatch: Array.isArray(parsed.whatToWatch) ? parsed.whatToWatch.slice(0, 3) : [],
    modelVersion: MODEL,
  };
  cache.set(key, { storedAt: Date.now(), data: out });
  pruneCache();
  return out;
}
