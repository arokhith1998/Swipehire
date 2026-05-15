/**
 * v2 schema additions — see docs/02_algorithm_v2.md §10.1 and docs/03_architecture.md §4.
 *
 * RULES:
 *   - Additive only. v1 read paths must keep working.
 *   - All new columns on existing tables are nullable.
 *   - New tables live in the new schemas (visa, ml, ops, audit).
 *   - The Drizzle `pgTable` schema parameter places the table in the right Postgres schema.
 */

import {
  pgTable, pgSchema, text, serial, integer, bigserial, boolean,
  timestamp, decimal, jsonb, date, varchar, vector, primaryKey,
  index, uniqueIndex, real,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// =====================================================================
// Schema namespaces
// =====================================================================
export const visaSchema = pgSchema('visa');
export const mlSchema = pgSchema('ml');
export const opsSchema = pgSchema('ops');
export const auditSchema = pgSchema('audit');

// =====================================================================
// visa schema — DOL OFLC LCA + USCIS H-1B Hub data
// =====================================================================

/** Per-LCA record from DOL OFLC quarterly disclosure files. */
export const lcaRecords = visaSchema.table(
  'lca_records',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    fein: text('fein').notNull(),
    employerName: text('employer_name').notNull(),
    socCode: text('soc_code').notNull(),
    jobTitle: text('job_title'),
    visaClass: text('visa_class'),                       // H-1B, H-1B1, E-3, etc.
    wageOffered: decimal('wage_offered', { precision: 12, scale: 2 }),
    wageUnit: text('wage_unit'),                          // 'Year' | 'Hour' | 'Month' | 'Bi-Weekly' | 'Week'
    prevailingWage: decimal('prevailing_wage', { precision: 12, scale: 2 }),
    pwLevel: text('pw_level'),                            // I | II | III | IV
    worksiteCity: text('worksite_city'),
    worksiteState: text('worksite_state'),
    worksitePostalCode: text('worksite_postal_code'),
    decision: text('decision').notNull(),                 // Certified | Denied | Withdrawn | Certified-Withdrawn
    decisionDate: date('decision_date'),
    employmentStartDate: date('employment_start_date'),
    employmentEndDate: date('employment_end_date'),
    fiscalYear: integer('fiscal_year'),
    fiscalQuarter: text('fiscal_quarter'),                // 'FY26Q1' etc.
    sourceFile: text('source_file'),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow().notNull(),
  },
  t => ({
    feinSocIdx: index('idx_lca_fein_soc').on(t.fein, t.socCode),
    employerNameIdx: index('idx_lca_employer_name').on(t.employerName),
    decisionDateIdx: index('idx_lca_decision_date').on(t.decisionDate),
    fyIdx: index('idx_lca_fiscal_year').on(t.fiscalYear),
  })
);

/** Annual USCIS H-1B Employer Data Hub rollup (initial vs continuing, approved vs denied). */
export const uscisPetitions = visaSchema.table(
  'uscis_petitions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    fein: text('fein'),
    employerName: text('employer_name').notNull(),
    fiscalYear: integer('fiscal_year').notNull(),
    initialApproved: integer('initial_approved').default(0),
    initialDenied: integer('initial_denied').default(0),
    continuingApproved: integer('continuing_approved').default(0),
    continuingDenied: integer('continuing_denied').default(0),
    naicsCode: text('naics_code'),
    industry: text('industry'),
    stateOfWork: text('state_of_work'),
    cityOfWork: text('city_of_work'),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow().notNull(),
  },
  t => ({
    feinFyIdx: index('idx_uscis_fein_fy').on(t.fein, t.fiscalYear),
    employerNameIdx: index('idx_uscis_employer_name').on(t.employerName),
  })
);

/** Per-employer per-SOC rollup. Recomputed nightly. Read on every visa scoring request. */
export const employerVisaStats = visaSchema.table(
  'employer_visa_stats',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    fein: text('fein').notNull(),
    socCode: text('soc_code'),                            // NULL = all SOCs aggregated
    visaClass: text('visa_class'),                        // NULL = all classes
    totalLcas24mo: integer('total_lcas_24mo').default(0),
    certifiedCount: integer('certified_count').default(0),
    deniedCount: integer('denied_count').default(0),
    withdrawnCount: integer('withdrawn_count').default(0),
    medianWageOffered: decimal('median_wage_offered', { precision: 12, scale: 2 }),
    p25WageOffered: decimal('p25_wage_offered', { precision: 12, scale: 2 }),
    p75WageOffered: decimal('p75_wage_offered', { precision: 12, scale: 2 }),
    distinctSocs: integer('distinct_socs').default(0),
    distinctWorksites: integer('distinct_worksites').default(0),
    lastSponsoredAt: date('last_sponsored_at'),
    firstSponsoredAt: date('first_sponsored_at'),
    computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  t => ({
    uniqueFeinSocClass: uniqueIndex('uq_employer_visa_stats').on(t.fein, t.socCode, t.visaClass),
    feinIdx: index('idx_evs_fein').on(t.fein),
  })
);

/** OFLC prevailing wage data — used for visa "safe harbor" check. */
export const prevailingWages = visaSchema.table(
  'prevailing_wages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    socCode: text('soc_code').notNull(),
    areaCode: text('area_code').notNull(),                // BLS metro area code
    areaName: text('area_name'),
    state: text('state'),
    level: text('level').notNull(),                        // I | II | III | IV
    annualWage: decimal('annual_wage', { precision: 12, scale: 2 }),
    hourlyWage: decimal('hourly_wage', { precision: 8, scale: 2 }),
    fiscalYear: integer('fiscal_year').notNull(),
    sourceFile: text('source_file'),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow().notNull(),
  },
  t => ({
    socAreaLevelIdx: uniqueIndex('uq_pw_soc_area_level_fy')
      .on(t.socCode, t.areaCode, t.level, t.fiscalYear),
  })
);

// =====================================================================
// ml schema — taxonomies + calibration
// =====================================================================

/** Canonical skill taxonomy with embeddings. ~5,000 skills initially. */
export const skillTaxonomy = mlSchema.table(
  'skill_taxonomy',
  {
    id: serial('id').primaryKey(),
    canonical: text('canonical').notNull().unique(),
    aliases: text('aliases').array().default(sql`ARRAY[]::text[]`),
    category: text('category'),                           // 'language' | 'framework' | 'tool' | 'soft' | 'domain'
    embedding: vector('embedding', { dimensions: 1024 }), // bge-large-en-v1.5
    embeddingModel: text('embedding_model').default('bge-large-en-v1.5'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  }
);
// HNSW index for vector cosine similarity (created via raw SQL in 0005_indexes migration):
//   CREATE INDEX idx_skill_taxonomy_emb ON ml.skill_taxonomy
//   USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

/** Role family taxonomy — used by titleAlignment scorer. */
export const roleFamilies = mlSchema.table(
  'role_families',
  {
    id: serial('id').primaryKey(),
    canonical: text('canonical').notNull().unique(),
    parentId: integer('parent_id'),                       // self-ref for hierarchy
    aliases: text('aliases').array().default(sql`ARRAY[]::text[]`),
    siblings: integer('siblings').array().default(sql`ARRAY[]::int[]`),
    relatedTo: integer('related_to').array().default(sql`ARRAY[]::int[]`),
    socCodes: text('soc_codes').array().default(sql`ARRAY[]::text[]`),
    description: text('description'),
  }
);

/** BLS Standard Occupational Classification reference. */
export const socCodes = mlSchema.table(
  'soc_codes',
  {
    code: text('code').primaryKey(),                      // e.g. '15-1252'
    title: text('title').notNull(),
    description: text('description'),
    majorGroup: text('major_group'),                      // e.g. '15-0000'
    minorGroup: text('minor_group'),                      // e.g. '15-1200'
    isStem: boolean('is_stem').default(false),
    cipCodes: text('cip_codes').array().default(sql`ARRAY[]::text[]`),
  }
);

/** Versioned calibration models. Active model is the one the matcher uses. */
export const calibrationModels = mlSchema.table(
  'calibration_models',
  {
    id: serial('id').primaryKey(),
    version: text('version').notNull().unique(),
    roleFamilyId: integer('role_family_id'),              // NULL = global default
    method: text('method').notNull(),                     // 'isotonic' | 'beta' | 'logistic'
    artifactUri: text('artifact_uri').notNull(),          // R2 URL
    trainedOnRows: integer('trained_on_rows'),
    validationMetrics: jsonb('validation_metrics'),
    status: text('status').notNull().default('staged'),   // 'staged' | 'active' | 'deprecated'
    trainedAt: timestamp('trained_at', { withTimezone: true }).defaultNow().notNull(),
    promotedAt: timestamp('promoted_at', { withTimezone: true }),
  }
);

/** Per (user_id, job_id) outcome — source for calibration retraining. */
export const scoreOutcomes = mlSchema.table(
  'score_outcomes',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id').notNull(),
    jobId: integer('job_id'),
    recruiterJobId: integer('recruiter_job_id'),
    matchResult: jsonb('match_result').notNull(),         // full MatchResult at scoring time
    modelVersion: text('model_version'),
    outcome: text('outcome'),                             // see applications.outcome
    outcomeAt: timestamp('outcome_at', { withTimezone: true }),
    outcomeSource: text('outcome_source'),                // 'user' | 'recruiter' | 'inferred'
    scoredAt: timestamp('scored_at', { withTimezone: true }).defaultNow().notNull(),
  },
  t => ({
    userIdx: index('idx_so_user').on(t.userId),
    jobIdx: index('idx_so_job').on(t.jobId),
    outcomeIdx: index('idx_so_outcome').on(t.outcome),
  })
);

/** Versioned ghost-job classifier. */
export const ghostClassifierModels = mlSchema.table(
  'ghost_classifier_models',
  {
    id: serial('id').primaryKey(),
    version: text('version').notNull().unique(),
    artifactUri: text('artifact_uri').notNull(),
    features: text('features').array(),
    validationMetrics: jsonb('validation_metrics'),
    status: text('status').notNull().default('staged'),
    trainedAt: timestamp('trained_at', { withTimezone: true }).defaultNow().notNull(),
  }
);

// =====================================================================
// ops schema — operational state (rolling window)
// =====================================================================

/** Append-only liveness check log. Source for the ghost classifier. */
export const jobLivenessChecks = opsSchema.table(
  'job_liveness_checks',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    jobId: integer('job_id').notNull(),
    checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow().notNull(),
    httpStatus: integer('http_status'),
    isLive: boolean('is_live').notNull(),
    reason: text('reason'),
    contentLength: integer('content_length'),
    finalUrl: text('final_url'),
    parserVersion: text('parser_version'),
    durationMs: integer('duration_ms'),
  },
  t => ({
    jobCheckedIdx: index('idx_jlc_job_checked').on(t.jobId, t.checkedAt),
  })
);

/** Per-ATS auto-apply health metrics. Surfaced on the Honesty Dashboard. */
export const atsHealthMetrics = opsSchema.table(
  'ats_health_metrics',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    atsType: text('ats_type').notNull(),
    tier: integer('tier').notNull(),                       // 1 | 2 | 3
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
    attempted: integer('attempted').default(0),
    succeeded: integer('succeeded').default(0),
    failed: integer('failed').default(0),
    requiresHuman: integer('requires_human').default(0),
    avgDurationMs: integer('avg_duration_ms'),
    topFailureReasons: jsonb('top_failure_reasons'),
    computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  t => ({
    atsWindowIdx: index('idx_ats_window').on(t.atsType, t.windowStart),
  })
);

/** Ingestion run log — DOL, USCIS, ATS aggregator pulls. */
export const ingestionRuns = opsSchema.table(
  'ingestion_runs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    source: text('source').notNull(),                     // 'dol_lca' | 'uscis_hub' | 'greenhouse' | ...
    sourceRef: text('source_ref'),                        // file name, URL, company slug
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    status: text('status').notNull().default('running'),  // running | success | failure | partial
    rowsIngested: integer('rows_ingested').default(0),
    rowsSkipped: integer('rows_skipped').default(0),
    error: text('error'),
    durationMs: integer('duration_ms'),
  }
);

/** Password reset tokens — short-lived, one-shot. Hash stored, not the raw token. */
export const passwordResetTokens = opsSchema.table(
  'password_reset_tokens',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id').notNull(),
    tokenHash: text('token_hash').notNull(),              // sha256 of the raw token
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byHash: uniqueIndex('password_reset_tokens_hash_idx').on(t.tokenHash),
    byUser: index('password_reset_tokens_user_idx').on(t.userId),
  })
);

// =====================================================================
// audit schema — score decisions (90-day retention)
// =====================================================================

/** Append-only: every score the matcher produces, with full explanation. */
export const scoreDecisions = auditSchema.table(
  'score_decisions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id').notNull(),
    jobId: integer('job_id'),
    requestId: text('request_id'),                        // trace id
    matchResult: jsonb('match_result').notNull(),
    modelVersion: text('model_version'),
    durationMs: integer('duration_ms'),
    cachedHit: boolean('cached_hit').default(false),
    scoredAt: timestamp('scored_at', { withTimezone: true }).defaultNow().notNull(),
  },
  t => ({
    userScoredIdx: index('idx_sd_user_scored').on(t.userId, t.scoredAt),
  })
);

/** Append-only: every data export the user requests. */
export const dataExportLog = auditSchema.table(
  'data_export_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    exportUri: text('export_uri'),
    bytesExported: integer('bytes_exported'),
  }
);

// =====================================================================
// Type exports
// =====================================================================
export type LcaRecord = typeof lcaRecords.$inferSelect;
export type InsertLcaRecord = typeof lcaRecords.$inferInsert;
export type EmployerVisaStats = typeof employerVisaStats.$inferSelect;
export type SkillTaxonomy = typeof skillTaxonomy.$inferSelect;
export type RoleFamily = typeof roleFamilies.$inferSelect;
export type SocCode = typeof socCodes.$inferSelect;
export type ScoreOutcome = typeof scoreOutcomes.$inferSelect;
export type JobLivenessCheck = typeof jobLivenessChecks.$inferSelect;
export type AtsHealthMetric = typeof atsHealthMetrics.$inferSelect;
export type IngestionRun = typeof ingestionRuns.$inferSelect;
export type ScoreDecision = typeof scoreDecisions.$inferSelect;
