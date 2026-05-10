import { pgTable, text, serial, integer, boolean, timestamp, decimal, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password"),
  googleId: text("google_id"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  location: text("location"),
  profilePicture: text("profile_picture"),
  targetJobTitle: text("target_job_title"),
  preferredLocation: text("preferred_location"),
  visaStatus: text("visa_status"), // "us_citizen", "green_card", "h1b", "opt", "f1", "other"
  jobTitle: text("job_title"),
  experience: text("experience"), // "entry", "junior", "mid", "senior", "staff", "principal", "director"
  expectedSalary: text("expected_salary"),
  bio: text("bio"),
  education: text("education"),
  remotePreference: text("remote_preference"), // "remote", "hybrid", "onsite"
  skills: text("skills").array(),
  resumeData: jsonb("resume_data"),
  originalResumeContent: text("original_resume_content"),
  originalResumeUrl: text("original_resume_url"),
  isProfileComplete: boolean("is_profile_complete").default(false),
  // Recruiter fields
  userType: text("user_type").default("jobseeker"), // "jobseeker", "recruiter", "admin"
  companyId: integer("company_id").references(() => companies.id),
  recruiterTitle: text("recruiter_title"),
  isVerifiedRecruiter: boolean("is_verified_recruiter").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Companies table for recruiter organizations
export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  website: text("website"),
  logo: text("logo"),
  size: text("size"), // "startup", "small", "medium", "large", "enterprise"
  industry: text("industry"),
  location: text("location"),
  sponsorsVisa: boolean("sponsors_visa").default(false),
  h1bApprovalRate: decimal("h1b_approval_rate"),
  totalEmployees: integer("total_employees"),
  foundedYear: integer("founded_year"),
  benefits: text("benefits").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Job postings by recruiters
export const recruiterJobs = pgTable("recruiter_jobs", {
  id: serial("id").primaryKey(),
  recruiterId: integer("recruiter_id").notNull().references(() => users.id),
  companyId: integer("company_id").notNull().references(() => companies.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  requirements: text("requirements").array(),
  responsibilities: text("responsibilities").array(),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  currency: text("currency").default("USD"),
  type: text("type").default("full-time"), // "full-time", "part-time", "contract", "intern"
  location: text("location").notNull(),
  isRemote: boolean("is_remote").default(false),
  isHybrid: boolean("is_hybrid").default(false),
  sponsorsVisa: boolean("sponsors_visa").default(false),
  experienceLevel: text("experience_level"), // "entry", "junior", "mid", "senior", "staff", "principal", "director"
  skills: text("skills").array(),
  department: text("department"),
  status: text("status").default("active"), // "active", "paused", "closed", "draft"
  applicationDeadline: timestamp("application_deadline"),
  startDate: timestamp("start_date"),
  benefits: text("benefits").array(),
  applicationInstructions: text("application_instructions"),
  applicationUrl: text("application_url"),
  viewCount: integer("view_count").default(0),
  applicationCount: integer("application_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Candidate applications to recruiter jobs
export const recruiterApplications = pgTable("recruiter_applications", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => recruiterJobs.id),
  candidateId: integer("candidate_id").notNull().references(() => users.id),
  recruiterId: integer("recruiter_id").notNull().references(() => users.id),
  status: text("status").default("pending"), // "pending", "reviewed", "shortlisted", "interview", "offer", "rejected", "withdrawn"
  coverLetter: text("cover_letter"),
  resumeContent: text("resume_content"),
  tailoredResumeContent: text("tailored_resume_content"),
  matchScore: decimal("match_score"),
  visaScore: decimal("visa_score"),
  recruiterNotes: text("recruiter_notes"),
  interviewDate: timestamp("interview_date"),
  feedback: text("feedback"),
  appliedAt: timestamp("applied_at").defaultNow(),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

// Candidate shortlists for recruiters
export const candidateShortlists = pgTable("candidate_shortlists", {
  id: serial("id").primaryKey(),
  recruiterId: integer("recruiter_id").notNull().references(() => users.id),
  candidateId: integer("candidate_id").notNull().references(() => users.id),
  jobId: integer("job_id").references(() => recruiterJobs.id),
  notes: text("notes"),
  rating: integer("rating"), // 1-5 stars
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location").notNull(),
  description: text("description").notNull(),
  requirements: text("requirements").array(),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  type: text("type"), // "full-time", "part-time", "contract"
  isRemote: boolean("is_remote").default(false),
  isHybrid: boolean("is_hybrid").default(false),
  sponsorsVisa: boolean("sponsors_visa").default(false),
  h1bApprovalRate: decimal("h1b_approval_rate"),
  recentSponsorshipCount: integer("recent_sponsorship_count"),
  externalUrl: text("external_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userJobInteractions = pgTable("user_job_interactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  jobId: integer("job_id").notNull().references(() => jobs.id),
  action: text("action").notNull(), // "swipe_right", "swipe_left", "bookmark", "apply"
  matchScore: decimal("match_score"),
  visaScore: decimal("visa_score"),
  tailoredResumeData: jsonb("tailored_resume_data"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const applications = pgTable("applications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  jobId: integer("job_id").notNull().references(() => jobs.id),
  interactionId: integer("interaction_id").references(() => userJobInteractions.id),
  status: text("status").default("pending"), // "pending", "viewed", "interview", "rejected", "offer"
  resumeVersion: text("resume_version"), // tracks which resume version was used
  resumeContent: text("resume_content"), // stores the actual resume content used
  appliedAt: timestamp("applied_at").defaultNow(),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const jobDigests = pgTable("job_digests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  digestType: text("digest_type").notNull(), // daily, weekly
  jobCount: integer("job_count").notNull().default(0),
  sentAt: timestamp("sent_at").defaultNow(),
  lastJobDate: timestamp("last_job_date"),
});

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  interactions: many(userJobInteractions),
  applications: many(applications),
  jobDigests: many(jobDigests),
  company: one(companies, { fields: [users.companyId], references: [companies.id] }),
  recruiterJobs: many(recruiterJobs),
  recruiterApplications: many(recruiterApplications),
  candidateShortlists: many(candidateShortlists),
}));

export const companiesRelations = relations(companies, ({ many }) => ({
  employees: many(users),
  jobs: many(recruiterJobs),
}));

export const recruiterJobsRelations = relations(recruiterJobs, ({ one, many }) => ({
  recruiter: one(users, { fields: [recruiterJobs.recruiterId], references: [users.id] }),
  company: one(companies, { fields: [recruiterJobs.companyId], references: [companies.id] }),
  applications: many(recruiterApplications),
}));

export const recruiterApplicationsRelations = relations(recruiterApplications, ({ one }) => ({
  job: one(recruiterJobs, { fields: [recruiterApplications.jobId], references: [recruiterJobs.id] }),
  candidate: one(users, { fields: [recruiterApplications.candidateId], references: [users.id] }),
  recruiter: one(users, { fields: [recruiterApplications.recruiterId], references: [users.id] }),
}));

export const candidateShortlistsRelations = relations(candidateShortlists, ({ one }) => ({
  recruiter: one(users, { fields: [candidateShortlists.recruiterId], references: [users.id] }),
  candidate: one(users, { fields: [candidateShortlists.candidateId], references: [users.id] }),
  job: one(recruiterJobs, { fields: [candidateShortlists.jobId], references: [recruiterJobs.id] }),
}));

export const jobsRelations = relations(jobs, ({ many }) => ({
  interactions: many(userJobInteractions),
  applications: many(applications),
}));

export const userJobInteractionsRelations = relations(userJobInteractions, ({ one }) => ({
  user: one(users, {
    fields: [userJobInteractions.userId],
    references: [users.id],
  }),
  job: one(jobs, {
    fields: [userJobInteractions.jobId],
    references: [jobs.id],
  }),
}));

export const applicationsRelations = relations(applications, ({ one }) => ({
  user: one(users, {
    fields: [applications.userId],
    references: [users.id],
  }),
  job: one(jobs, {
    fields: [applications.jobId],
    references: [jobs.id],
  }),
  interaction: one(userJobInteractions, {
    fields: [applications.interactionId],
    references: [userJobInteractions.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
  createdAt: true,
});

export const insertUserJobInteractionSchema = createInsertSchema(userJobInteractions).omit({
  id: true,
  createdAt: true,
});

export const insertApplicationSchema = createInsertSchema(applications).omit({
  id: true,
  appliedAt: true,
  lastUpdated: true,
});

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRecruiterJobSchema = createInsertSchema(recruiterJobs).omit({
  id: true,
  viewCount: true,
  applicationCount: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRecruiterApplicationSchema = createInsertSchema(recruiterApplications).omit({
  id: true,
  appliedAt: true,
  lastUpdated: true,
});

export const insertCandidateShortlistSchema = createInsertSchema(candidateShortlists).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type UserJobInteraction = typeof userJobInteractions.$inferSelect;
export type InsertUserJobInteraction = z.infer<typeof insertUserJobInteractionSchema>;
export type Application = typeof applications.$inferSelect;
export type InsertApplication = z.infer<typeof insertApplicationSchema>;

export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type RecruiterJob = typeof recruiterJobs.$inferSelect;
export type InsertRecruiterJob = z.infer<typeof insertRecruiterJobSchema>;
export type RecruiterApplication = typeof recruiterApplications.$inferSelect;
export type InsertRecruiterApplication = z.infer<typeof insertRecruiterApplicationSchema>;
export type CandidateShortlist = typeof candidateShortlists.$inferSelect;
export type InsertCandidateShortlist = z.infer<typeof insertCandidateShortlistSchema>;
