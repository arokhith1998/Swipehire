/**
 * OpenAI prompts that produce structured CV + cover letter JSON.
 *
 * Uses gpt-4o-mini by default ($0.02 per typical generation). Override with
 * GENERATOR_MODEL env var if you need higher quality.
 */
import OpenAI from 'openai';
import type { GeneratorContext, GeneratedCV, GeneratedCoverLetter } from './types.js';

const MODEL = process.env.GENERATOR_MODEL ?? 'gpt-4o-mini';

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

const CV_SYSTEM = `You generate ATS-safe one-page resumes. You output strict JSON conforming to the requested schema. Rules:
- Pull facts ONLY from the candidate's resume bank. Never invent employers, dates, projects, degrees, or metrics.
- Tailor wording, ordering, and emphasis to the target job — surface the most relevant bullets first.
- Include experiences and projects from BOTH the primary and extra resumes when relevant; treat the extras as additional source material.
- Bullets must be specific, action-led, and quantified where the source provides numbers. Drop adverbs and filler.
- Total content must fit one US Letter page in Calibri 9.5pt. Aim for ≤6 experience bullets total across roles, ≤4 projects, ≤3 lines of summary.
- Group skills into 3-5 logical categories (e.g. Languages, Cloud, Data, etc.) — categorize based on what the role asks for.`;

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
