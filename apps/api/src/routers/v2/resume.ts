/**
 * /api/profile/parse-resume — extract structured fields from pasted resume text.
 *
 * The user can paste their resume in any format (text from a PDF, LinkedIn
 * export, plain text). We extract:
 *   - Skills (using the same canonical keyword scan the matcher uses)
 *   - Experience level (Senior / Junior / Staff / etc. heuristics)
 *   - Most recent / target job title
 *   - Location (city detection)
 *   - Detected employers
 *
 * Returns a partial profile object the onboarding UI can use to pre-fill
 * the form. The user reviews and edits before saving.
 *
 * Routes:
 *   POST /api/profile/parse-resume   { text: string } -> { extracted: {...} }
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

export const resumeRouter: Router = Router();

const COMMON_SKILLS = [
  // Languages
  'Python', 'JavaScript', 'TypeScript', 'Go', 'Rust', 'Java', 'Kotlin', 'Swift',
  'Ruby', 'C++', 'C#', 'Scala', 'Elixir', 'PHP', 'R', 'MATLAB',
  // Web
  'React', 'Next.js', 'Vue', 'Svelte', 'Angular', 'Node.js', 'Express',
  'HTML', 'CSS', 'Tailwind', 'GraphQL', 'REST',
  // Data + ML
  'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Snowflake', 'BigQuery',
  'PyTorch', 'TensorFlow', 'CUDA', 'Pandas', 'NumPy', 'Scikit-learn',
  'Spark', 'Kafka', 'Airflow', 'dbt', 'LLM', 'RAG',
  // Cloud + Infra
  'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'Terraform', 'Ansible',
  'Linux', 'Bash',
  // Marketing/analytics
  'Google Analytics', 'GA4', 'Google Ads', 'Meta Ads', 'HubSpot', 'Marketo',
  'Salesforce', 'Mixpanel', 'Amplitude', 'Segment', 'Tableau', 'Looker',
  'A/B Testing', 'SEO', 'SEM',
  // Design + PM
  'Figma', 'Sketch', 'Jira', 'Linear', 'Notion', 'Confluence',
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSkills(text: string): string[] {
  const found = new Set<string>();
  for (const skill of COMMON_SKILLS) {
    const re = new RegExp(`(?:^|[^A-Za-z0-9_])${escapeRegex(skill)}(?=$|[^A-Za-z0-9_])`, 'i');
    if (re.test(text)) found.add(skill);
  }
  return Array.from(found);
}

/** Infer seniority level from explicit titles + years-of-experience phrases. */
function extractExperience(text: string): string | null {
  const t = text.toLowerCase();
  if (/\b(director|vp|vice president|head of)\b/.test(t)) return 'director';
  if (/\b(principal|distinguished)\b/.test(t)) return 'principal';
  if (/\bstaff\b/.test(t)) return 'staff';
  if (/\b(senior|sr\.|lead)\b/.test(t)) return 'senior';
  // Years of experience
  const yoe = t.match(/(\d+)\+?\s*(years?|yrs?)\s+(of\s+)?(experience|exp)/);
  if (yoe) {
    const years = parseInt(yoe[1], 10);
    if (years >= 10) return 'staff';
    if (years >= 6) return 'senior';
    if (years >= 3) return 'mid';
    if (years >= 1) return 'junior';
  }
  if (/\b(junior|jr\.|associate)\b/.test(t)) return 'junior';
  if (/\b(intern|internship)\b/.test(t)) return 'intern';
  if (/\b(entry[-\s]?level|new grad|recent graduate)\b/.test(t)) return 'entry';
  return null;
}

/** Pull out the most recent job title (heuristic: line containing common SWE/PM/etc. keywords). */
function extractJobTitle(text: string): string | null {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const TITLE_KEYWORDS = /\b(engineer|developer|scientist|manager|analyst|designer|architect|consultant|specialist|director)\b/i;
  for (const line of lines.slice(0, 30)) {  // Most recent role usually in first ~30 lines
    if (line.length > 100) continue;          // Skip paragraphs
    if (TITLE_KEYWORDS.test(line)) {
      // Strip dates, employer names — return cleanest single phrase.
      const cleaned = line
        .replace(/\b(20\d{2}|19\d{2})\s*[-–]\s*(present|20\d{2})\b/gi, '')
        .replace(/\b\d{1,2}\/\d{2,4}\b/g, '')
        .replace(/\s*[|•·@]\s*.*$/, '')          // Drop everything after pipe/bullet/at
        .trim();
      if (cleaned && cleaned.length < 80) return cleaned;
    }
  }
  return null;
}

/** Detect mentioned US metros. */
function extractLocation(text: string): string | null {
  const t = text.toLowerCase();
  const hits: string[] = [];
  if (/\b(san francisco|bay area|sf,)\b/.test(t)) hits.push('San Francisco, CA');
  if (/\b(new york|nyc|brooklyn|manhattan)\b/.test(t)) hits.push('New York, NY');
  if (/\b(los angeles|la,)\b/.test(t)) hits.push('Los Angeles, CA');
  if (/\bseattle\b/.test(t)) hits.push('Seattle, WA');
  if (/\baustin\b/.test(t)) hits.push('Austin, TX');
  if (/\bboston\b/.test(t)) hits.push('Boston, MA');
  if (/\bchicago\b/.test(t)) hits.push('Chicago, IL');
  if (/\b(washington,?\s*dc|d\.c\.)\b/.test(t)) hits.push('Washington, DC');
  return hits[0] ?? null;
}

const parseSchema = z.object({
  text: z.string().min(50, 'Need at least ~50 characters of resume content').max(50000),
});

resumeRouter.post('/api/profile/parse-resume', (req: Request, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }

  const parsed = parseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
    return;
  }

  const text = parsed.data.text;
  const skills = extractSkills(text);
  const experience = extractExperience(text);
  const targetJobTitle = extractJobTitle(text);
  const detectedLocation = extractLocation(text);

  res.json({
    extracted: {
      skills,
      experience,
      targetJobTitle,
      detectedLocation,
    },
    confidence: {
      skills: skills.length >= 3 ? 'high' : skills.length >= 1 ? 'medium' : 'low',
      experience: experience ? 'medium' : 'low',
      targetJobTitle: targetJobTitle ? 'medium' : 'low',
      detectedLocation: detectedLocation ? 'medium' : 'low',
    },
    rawTextLength: text.length,
  });
});
