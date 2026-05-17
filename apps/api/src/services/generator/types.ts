/**
 * Structured shapes the OpenAI generator produces. Both renderers (HTML→PDF
 * and DOCX) consume the same JSON so PDF and DOCX outputs stay in sync.
 */

export interface GeneratedCV {
  name: string;
  headline: string;                 // "Senior MLE | RAG, distributed systems"
  contact: ContactBlock;
  summary: string;                  // 2-3 line summary tailored to the role
  competencies?: string[];          // 6-8 JD-keyword phrases for the Core Competencies tag grid
  skills: Array<{ category: string; items: string[] }>;
  experience: Array<{
    title: string;
    company: string;
    location?: string;
    dates: string;
    bullets: string[];
  }>;
  projects: Array<{
    name: string;
    dates?: string;
    description: string;
    link?: string;
  }>;
  education: Array<{
    degree: string;
    school: string;
    dates: string;
    extras?: string[];              // relevant coursework, honors, etc.
  }>;
  certifications?: string[];        // simple inline list
}

export interface GeneratedCoverLetter {
  candidateName: string;
  contact: ContactBlock;
  company: string;
  role: string;
  date: string;                     // "May 16, 2026"
  bodyHtml: string;                 // <p>...</p><p>...</p>
}

export interface ContactBlock {
  location: string;
  phone?: string;
  email: string;
  linkedin?: string;
  portfolio?: string;
}

/** Inputs the generator pulls out of the user record + DB. */
export interface GeneratorContext {
  user: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
    location?: string | null;
    bio?: string | null;
    education?: string | null;     // free-text from profile, used as fallback if no resume entry
  };
  job: {
    id: number;
    title: string;
    company: string;
    description: string;
    location?: string | null;
    requirements?: string[];
  };
  resumes: Array<{
    label: string;
    isPrimary: boolean;
    rawText: string;
  }>;
}
