/**
 * Applier types — auto-apply job submission contract.
 * Per docs/03_architecture.md §11.
 */

export type ApplyTier = 1 | 2 | 3;

export type ApplyStatus = 'success' | 'failed' | 'requires_human' | 'queued';

export interface ApplyContext {
  userId: number;
  jobId: number;
  jobUrl: string;
  ats: string;
  tier: ApplyTier;
  resumeContent: string;
  resumeFilePath?: string;
  coverLetter?: string;
  // Pre-resolved answers to common questions
  answers: {
    fullName: string;
    email: string;
    phone?: string;
    linkedinUrl?: string;
    githubUrl?: string;
    portfolioUrl?: string;
    workAuthorized: boolean;
    requiresSponsorship: boolean;
    visaStatus?: string;
    location?: string;
    salaryExpectation?: string;
    yearsOfExperience?: string;
    coverLetter?: string;
    /** Free-form answers keyed by normalized question. */
    extras?: Record<string, string>;
  };
}

export interface ApplyResult {
  status: ApplyStatus;
  reason?: string;
  durationMs: number;
  screenshots?: string[];   // R2 URLs of screenshots taken during attempt
  filledFields: string[];
  unansweredQuestions: string[];
  atsApplicationId?: string;
}

export interface AtsAdapter {
  readonly ats: string;
  readonly tier: ApplyTier;
  apply(ctx: ApplyContext): Promise<ApplyResult>;
}
