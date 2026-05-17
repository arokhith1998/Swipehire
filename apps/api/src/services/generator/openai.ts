/**
 * OpenAI prompts that produce structured CV + cover letter JSON.
 *
 * Uses gpt-4o-mini by default ($0.02 per typical generation). Override with
 * GENERATOR_MODEL env var if you need higher quality.
 */
import OpenAI from 'openai';
import type { GeneratorContext, GeneratedCV, GeneratedCoverLetter } from './types.js';

// gpt-4o (full) follows the strict-instruction prompt + JSON shape MUCH better
// than 4o-mini for this task. ~$0.05 per resume generation — acceptable given
// users only generate when they actually want to apply.
const MODEL = process.env.GENERATOR_MODEL ?? 'gpt-4o';

function client(): OpenAI {
  // Accept either OPENAI_API_KEY (canonical) or OPEN_API_KEY (typo people
  // commonly make — including in our own Railway setup). Either works.
  const key = process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not configured');
  return new OpenAI({ apiKey: key });
}

function resumeBank(ctx: GeneratorContext): string {
  return ctx.resumes.map((r, i) => {
    const tag = r.isPrimary ? 'PRIMARY' : `EXTRA #${i}`;
    return `--- ${tag} (${r.label}) ---\n${r.rawText.slice(0, 8000)}`;
  }).join('\n\n');
}

function jobBlock(ctx: GeneratorContext): string {
  return `Title: ${ctx.job.title}\nCompany: ${ctx.job.company}\nLocation: ${ctx.job.location ?? 'unspecified'}\n\nDescription:\n${ctx.job.description.slice(0, 6000)}`;
}

const CV_SYSTEM = `You are a senior resume writer who has written 500+ resumes that landed interviews at FAANG, top startups, and Fortune 500. You output STRICT JSON for an ATS-safe one-page resume.

═══════════════════════════════════════════════════════════
GOLDEN RULE: FACTS FROM BANK, WORDS FROM JD
═══════════════════════════════════════════════════════════
The "RESUME BANK" is the source of every FACT in your output (employers, roles, dates, technologies the candidate actually used, projects, metrics, degrees). The target JD is the source of the VOCABULARY you frame those facts in.

You SHOULD rewrite freely:
  • Restructure a sentence to lead with the action and end with the result
  • Combine two related bullets into one tighter line
  • Split a giant bullet into two cleaner ones
  • Swap vocabulary to match JD language (e.g. "LLM workflows with retrieval" → "RAG pipelines")
  • Reorder bullets so the most JD-relevant ones lead each role
  • Drop bullets that have no relevance to the target JD

You may NOT invent:
  • A metric. "+25% CPA" in the bank can't become "+50% CPA" in the output. If a bullet's metric is "8% market-share gain", keep "8%" exactly.
  • An employer, role title, project name, degree, or date.
  • A technology the candidate hasn't used. If JD mentions Snowflake but the bank doesn't, Snowflake doesn't appear in Skills.
  • Years-of-experience or domain claims in the Summary. If the bank shows 4 years of marketing and the JD wants 8 years of HPC, the Summary says "4+ years in performance marketing and pricing strategy" — not "8+ years in HPC".
  • A Headline that pretends the candidate is in a domain they aren't. For a marketing resume applying to an HPC role, the Headline still says "Growth & Pricing Marketer | Performance Marketing", NOT "Datacenter Engineer". The candidate decides whether to apply — your job is to put their genuine strongest case forward, not forge a fit.

Quick gut-check: if a hiring manager calls and asks "tell me about [X claim in the resume]", the candidate should be able to back it up from the bank. If not, the claim is invented and must be removed.

═══════════════════════════════════════════════════════════
STEP 1 — INTERNALLY EXTRACT 6-8 KEYWORDS FROM THE TARGET JD
═══════════════════════════════════════════════════════════
Before writing, identify the 6-8 most repeated/emphasized noun phrases in the JD (specific tools, frameworks, methodologies, business outcomes). Examples: "RAG pipelines", "LTV optimization", "credit risk modeling", "B2B paid social", "Snowflake + dbt". These become:
  • The Core Competencies tag grid (output as 'competencies')
  • The vocabulary you reformulate bullets to use
  • The framing of the Summary

═══════════════════════════════════════════════════════════
STEP 2 — REFORMULATE BULLETS TO ECHO JD VOCABULARY
═══════════════════════════════════════════════════════════
Examples of LEGITIMATE reformulation (these are real techniques):
  JD says "RAG pipelines", source bullet says "LLM workflows with retrieval"
    → "Designed RAG pipelines and LLM orchestration workflows that ..."
  JD says "MLOps", source bullet says "observability, evals, error handling"
    → "Built MLOps platform with observability, evals, error handling, and cost monitoring"
  JD says "stakeholder management", source bullet says "collaborated with team"
    → "Stakeholder management across engineering, operations, and business — drove ..."

ILLEGITIMATE (never do this):
  Source has no Snowflake experience → don't put Snowflake in skills just because JD mentions it
  Source has "+5% conversion" → don't inflate to "+50% conversion" even if JD wants big numbers

═══════════════════════════════════════════════════════════
STEP 3 — BUILD EACH BULLET IN STAR FORMAT
═══════════════════════════════════════════════════════════
Every experience bullet follows Situation/Task → Action → measurable Result. Start with a strong action verb. Drop adverbs, filler, and corporate-speak ("synergy", "passionate", "responsible for", "dynamic team player").

GOOD: "Built keyword + bid-management automation across Paid Search and Paid Social, cutting CPA 25% and lifting conversion 20%."
GOOD: "Led global pricing strategy for the Industrial BU; 8% market-share gain + 12% YoY revenue growth in EMEA."
BAD: "Responsible for digital marketing campaigns and analytics."  (no action, no result)
BAD: "Worked on improving the SEO strategy."  (vague, unquantified)

═══════════════════════════════════════════════════════════
HARD CAPS — MUST FIT ONE US LETTER PAGE AT CALIBRI 9.5PT
═══════════════════════════════════════════════════════════
  • Summary:        EXACTLY 2-3 sentences (~30-50 words). Front-load top 5 JD keywords.
  • Competencies:   EXACTLY 6-8 phrases. Each 2-4 words. These ARE the JD keywords from Step 1.
  • Skills:         EXACTLY 4-5 category rows. Each row = "Category: item1, item2, item3, ..." with 5-10 items. Categories chosen to mirror the JD (e.g. "Performance Marketing", "Analytics & MarTech", "Pricing").
  • Experience:     EXACTLY 3-4 most recent roles. 3-4 STAR bullets per role. ≤ 12 bullets total across all roles. First bullet of each role MUST contain at least one JD keyword.
  • Projects:       0-3 entries. Each a SINGLE STAR sentence (1 bullet).
  • Education:      All degrees the candidate has. One italic line of coursework per degree only if it strengthens the fit; otherwise just degree + school + dates.
  • Certifications: Single comma-separated line, only certs meaningful to the role.

If your draft exceeds these caps, CUT before submitting. A 14-bullet resume that overflows page 2 is worse than a 9-bullet one that fits.

═══════════════════════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════════════════════
Output a JSON object with this shape (no markdown, no prose around it):
{
  "name": "...",
  "headline": "Role-aligned tagline | 3-5 keyword phrases",
  "contact": { "location": "...", "phone": "...", "email": "...", "linkedin": "...", "portfolio": "..." },
  "summary": "2-3 sentences ...",
  "competencies": ["Phrase 1", "Phrase 2", "...", "Phrase 6-8"],
  "skills": [{ "category": "...", "items": ["...", "..."] }, ...4-5 rows],
  "experience": [{ "title": "...", "company": "...", "location": "...", "dates": "...", "bullets": ["...", "..."] }, ...3-4 roles],
  "projects": [{ "name": "...", "dates": "...", "description": "Single STAR sentence", "link": "..." }, ...0-3],
  "education": [{ "degree": "...", "school": "...", "dates": "...", "extras": ["..."] }, ...],
  "certifications": ["..."]
}`;

const COVER_LETTER_SYSTEM = `You generate one-page cover letters. Output STRICT JSON in this exact shape:
{
  "candidateName": "Jane Doe",
  "contact": { "location": "...", "phone": "...", "email": "...", "linkedin": "...", "portfolio": "..." },
  "company": "...",
  "role": "...",
  "date": "May 16, 2026",
  "bodyHtml": "<p>First paragraph...</p><p>Second paragraph...</p><p>Third paragraph...</p>"
}

The "bodyHtml" field is REQUIRED and must be a single string containing 3-4 <p>...</p> blocks.
Do NOT split paragraphs into an array. Do NOT use "body", "content", "letter", or any other key — only "bodyHtml".

Rules for the letter content:
- Pull facts only from the candidate's resume bank. Never fabricate experience.
- 3-4 short paragraphs. Hook in para 1 (why this role/company specifically), 2-3 concrete examples in para 2-3 mapping the candidate's experience to job requirements, sign-off in final para.
- Tone: confident but not boastful, specific not generic. Avoid "passionate", "synergy", "dynamic team player".
- Inside bodyHtml use only <p> and <strong> tags — no markdown, no headers, no greeting (the template adds it).`;

const CV_SCHEMA = {
  type: 'object',
  required: ['name','headline','contact','summary','skills','experience','projects','education'],
  properties: {
    name: { type: 'string' },
    headline: { type: 'string' },
    contact: {
      type: 'object',
      required: ['location','email'],
      properties: {
        location: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        linkedin: { type: 'string' },
        portfolio: { type: 'string' },
      },
    },
    summary: { type: 'string' },
    skills: {
      type: 'array',
      items: {
        type: 'object',
        required: ['category','items'],
        properties: {
          category: { type: 'string' },
          items: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    experience: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title','company','dates','bullets'],
        properties: {
          title: { type: 'string' },
          company: { type: 'string' },
          location: { type: 'string' },
          dates: { type: 'string' },
          bullets: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    projects: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name','description'],
        properties: {
          name: { type: 'string' },
          dates: { type: 'string' },
          description: { type: 'string' },
          link: { type: 'string' },
        },
      },
    },
    education: {
      type: 'array',
      items: {
        type: 'object',
        required: ['degree','school','dates'],
        properties: {
          degree: { type: 'string' },
          school: { type: 'string' },
          dates: { type: 'string' },
          extras: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    certifications: { type: 'array', items: { type: 'string' } },
  },
};

const COVER_SCHEMA = {
  type: 'object',
  required: ['candidateName','contact','company','role','date','bodyHtml'],
  properties: {
    candidateName: { type: 'string' },
    contact: {
      type: 'object',
      required: ['location','email'],
      properties: {
        location: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        linkedin: { type: 'string' },
        portfolio: { type: 'string' },
      },
    },
    company: { type: 'string' },
    role: { type: 'string' },
    date: { type: 'string' },
    bodyHtml: { type: 'string' },
  },
};

export async function generateCV(ctx: GeneratorContext): Promise<GeneratedCV> {
  const c = client();
  const userBlock = `Candidate: ${ctx.user.firstName} ${ctx.user.lastName}
Email: ${ctx.user.email}
Phone: ${ctx.user.phone ?? ''}
Location: ${ctx.user.location ?? ''}
Bio: ${ctx.user.bio ?? ''}
Education (profile field): ${ctx.user.education ?? ''}`;

  const userPrompt = `TARGET JOB:\n${jobBlock(ctx)}\n\nCANDIDATE PROFILE:\n${userBlock}\n\nRESUME BANK:\n${resumeBank(ctx)}\n\nGenerate the tailored CV JSON now.`;

  const r = await c.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: CV_SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 2000,
  });

  const raw = r.choices[0]?.message?.content;
  if (!raw) throw new Error('empty response from openai');
  let parsed: any;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error('openai returned non-JSON: ' + raw.slice(0, 200)); }

  // Normalize: fill in anything the model omitted with candidate-profile fallbacks
  // rather than rejecting the whole response.
  const fullName = `${ctx.user.firstName} ${ctx.user.lastName}`.trim();
  const cv: GeneratedCV = {
    name: parsed.name || fullName,
    headline: parsed.headline || ctx.job.title || 'Candidate',
    contact: {
      location: parsed.contact?.location || ctx.user.location || '',
      phone: parsed.contact?.phone || ctx.user.phone || undefined,
      email: parsed.contact?.email || ctx.user.email,
      linkedin: parsed.contact?.linkedin,
      portfolio: parsed.contact?.portfolio,
    },
    summary: parsed.summary || ctx.user.bio || '',
    competencies: Array.isArray(parsed.competencies) ? parsed.competencies.slice(0, 8) : undefined,
    skills: Array.isArray(parsed.skills) ? parsed.skills : [],
    experience: Array.isArray(parsed.experience) ? parsed.experience : [],
    projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    education: Array.isArray(parsed.education) ? parsed.education : [],
    certifications: Array.isArray(parsed.certifications) ? parsed.certifications : undefined,
  };
  if (cv.experience.length === 0 && cv.education.length === 0) {
    // Nothing usable — caller should retry or surface error.
    throw new Error('openai returned empty CV (no experience or education)');
  }
  return cv;
}

export async function generateCoverLetter(ctx: GeneratorContext): Promise<GeneratedCoverLetter> {
  const c = client();
  const userBlock = `Candidate: ${ctx.user.firstName} ${ctx.user.lastName}
Email: ${ctx.user.email}
Phone: ${ctx.user.phone ?? ''}
Location: ${ctx.user.location ?? ''}`;

  const userPrompt = `TARGET JOB:\n${jobBlock(ctx)}\n\nCANDIDATE PROFILE:\n${userBlock}\n\nRESUME BANK:\n${resumeBank(ctx)}\n\nWrite the cover letter JSON now. Today's date: ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}`;

  const r = await c.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: COVER_LETTER_SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.4,
    max_tokens: 1200,
  });

  const raw = r.choices[0]?.message?.content;
  if (!raw) throw new Error('empty response from openai');
  let parsed: any;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error('openai returned non-JSON: ' + raw.slice(0, 200)); }

  const fullName = `${ctx.user.firstName} ${ctx.user.lastName}`.trim();

  // Coerce any of the common shapes the model might return into a single
  // HTML string with <p> blocks.
  function toBodyHtml(p: any): string {
    if (typeof p.bodyHtml === 'string' && p.bodyHtml.trim()) return p.bodyHtml;
    if (Array.isArray(p.paragraphs)) {
      return p.paragraphs.map((s: any) => `<p>${String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`).join('');
    }
    for (const key of ['body', 'content', 'letter', 'text', 'message']) {
      const v = p[key];
      if (typeof v === 'string' && v.trim()) {
        // If already has <p>, use as-is; otherwise split on blank lines.
        if (/<p[\s>]/i.test(v)) return v;
        const paras = v.split(/\n\s*\n/).map((s: string) => s.trim()).filter(Boolean);
        return paras.map((s: string) => `<p>${s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</p>`).join('');
      }
      if (Array.isArray(v)) {
        return v.map((s: any) => `<p>${String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`).join('');
      }
    }
    return '';
  }

  const cl: GeneratedCoverLetter = {
    candidateName: parsed.candidateName || parsed.name || fullName,
    contact: {
      location: parsed.contact?.location || ctx.user.location || '',
      phone: parsed.contact?.phone || ctx.user.phone || undefined,
      email: parsed.contact?.email || ctx.user.email,
      linkedin: parsed.contact?.linkedin,
      portfolio: parsed.contact?.portfolio,
    },
    company: parsed.company || ctx.job.company,
    role: parsed.role || ctx.job.title,
    date: parsed.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    bodyHtml: toBodyHtml(parsed),
  };
  if (!cl.bodyHtml.trim()) {
    throw new Error('openai returned empty cover letter body (keys=' + Object.keys(parsed).join(',') + ')');
  }
  return cl;
}

// Keep schema constants exported in case we want to switch to OpenAI's structured-outputs API later.
export { CV_SCHEMA, COVER_SCHEMA };
