import { 
  users, 
  jobs, 
  userJobInteractions, 
  applications,
  companies,
  recruiterJobs,
  recruiterApplications,
  candidateShortlists,
  type User, 
  type InsertUser,
  type Job,
  type InsertJob,
  type UserJobInteraction,
  type InsertUserJobInteraction,
  type Application,
  type InsertApplication,
  type Company,
  type InsertCompany,
  type RecruiterJob,
  type InsertRecruiterJob,
  type RecruiterApplication,
  type InsertRecruiterApplication,
  type CandidateShortlist,
  type InsertCandidateShortlist
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, count, sql } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUsers(limit?: number, offset?: number): Promise<User[]>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<InsertUser>): Promise<User | undefined>;

  // Job methods
  getJobs(limit?: number, offset?: number): Promise<Job[]>;
  getJobsForUser(userId: number, limit?: number): Promise<Job[]>;
  getJob(id: number): Promise<Job | undefined>;
  createJob(job: InsertJob): Promise<Job>;

  // Interaction methods
  createInteraction(interaction: InsertUserJobInteraction): Promise<UserJobInteraction>;
  getUserInteractions(userId: number): Promise<UserJobInteraction[]>;
  getInteractionByUserAndJob(userId: number, jobId: number): Promise<UserJobInteraction | undefined>;

  // Application methods
  createApplication(application: InsertApplication): Promise<Application>;
  getUserApplications(userId: number): Promise<Application[]>;
  getApplicationStats(userId: number): Promise<{ total: number; pending: number; interviewed: number; }>;

  // Company methods
  getCompany(id: number): Promise<Company | undefined>;
  getCompanyByName(name: string): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: number, updates: Partial<InsertCompany>): Promise<Company | undefined>;
  getCompanies(limit?: number, offset?: number): Promise<Company[]>;

  // Recruiter job methods
  getRecruiterJob(id: number): Promise<RecruiterJob | undefined>;
  getRecruiterJobs(recruiterId: number, limit?: number): Promise<RecruiterJob[]>;
  getRecruiterJobsByCompany(companyId: number, limit?: number): Promise<RecruiterJob[]>;
  createRecruiterJob(job: InsertRecruiterJob): Promise<RecruiterJob>;
  updateRecruiterJob(id: number, updates: Partial<InsertRecruiterJob>): Promise<RecruiterJob | undefined>;
  deleteRecruiterJob(id: number): Promise<boolean>;

  // Recruiter application methods
  getRecruiterApplication(id: number): Promise<RecruiterApplication | undefined>;
  getRecruiterApplications(jobId: number, limit?: number): Promise<RecruiterApplication[]>;
  getRecruiterApplicationsByCandidate(candidateId: number, limit?: number): Promise<RecruiterApplication[]>;
  createRecruiterApplication(application: InsertRecruiterApplication): Promise<RecruiterApplication>;
  updateRecruiterApplication(id: number, updates: Partial<InsertRecruiterApplication>): Promise<RecruiterApplication | undefined>;

  // Candidate shortlist methods
  getCandidateShortlist(recruiterId: number, candidateId: number): Promise<CandidateShortlist | undefined>;
  getCandidateShortlists(recruiterId: number, limit?: number): Promise<CandidateShortlist[]>;
  createCandidateShortlist(shortlist: InsertCandidateShortlist): Promise<CandidateShortlist>;
  updateCandidateShortlist(id: number, updates: Partial<InsertCandidateShortlist>): Promise<CandidateShortlist | undefined>;
  deleteCandidateShortlist(id: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUsers(limit = 50, offset = 0): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(users.createdAt));
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUser(id: number, updates: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async getJobs(limit = 50, offset = 0): Promise<Job[]> {
    return await db
      .select()
      .from(jobs)
      .orderBy(desc(jobs.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getJobsForUser(userId: number, limit = 20): Promise<Job[]> {
    // Get jobs excluding ones the user has already interacted with
    const interactedJobIds = await db
      .select({ jobId: userJobInteractions.jobId })
      .from(userJobInteractions)
      .where(eq(userJobInteractions.userId, userId));

    const excludeIds = interactedJobIds.map(item => item.jobId);

    if (excludeIds.length === 0) {
      return await db
        .select()
        .from(jobs)
        .orderBy(desc(jobs.createdAt))
        .limit(limit);
    }

    return await db
      .select()
      .from(jobs)
      .where(sql`${jobs.id} NOT IN (${excludeIds.join(',')})`)
      .orderBy(desc(jobs.createdAt))
      .limit(limit);
  }

  async getJob(id: number): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job || undefined;
  }

  async createJob(insertJob: InsertJob): Promise<Job> {
    const [job] = await db
      .insert(jobs)
      .values(insertJob)
      .returning();
    return job;
  }

  async createInteraction(interaction: InsertUserJobInteraction): Promise<UserJobInteraction> {
    const [newInteraction] = await db
      .insert(userJobInteractions)
      .values(interaction)
      .returning();
    return newInteraction;
  }

  async getUserInteractions(userId: number): Promise<UserJobInteraction[]> {
    return await db
      .select()
      .from(userJobInteractions)
      .where(eq(userJobInteractions.userId, userId))
      .orderBy(desc(userJobInteractions.createdAt));
  }

  async getInteractionByUserAndJob(userId: number, jobId: number): Promise<UserJobInteraction | undefined> {
    const [interaction] = await db
      .select()
      .from(userJobInteractions)
      .where(and(
        eq(userJobInteractions.userId, userId),
        eq(userJobInteractions.jobId, jobId)
      ));
    return interaction || undefined;
  }

  async createApplication(application: InsertApplication): Promise<Application> {
    const [newApplication] = await db
      .insert(applications)
      .values(application)
      .returning();
    return newApplication;
  }

  async getUserApplications(userId: number): Promise<Application[]> {
    return await db
      .select({
        id: applications.id,
        userId: applications.userId,
        jobId: applications.jobId,
        interactionId: applications.interactionId,
        status: applications.status,
        appliedAt: applications.appliedAt,
        lastUpdated: applications.lastUpdated,
        jobTitle: jobs.title,
        company: jobs.company,
        location: jobs.location,
      })
      .from(applications)
      .leftJoin(jobs, eq(applications.jobId, jobs.id))
      .where(eq(applications.userId, userId))
      .orderBy(desc(applications.appliedAt)) as any;
  }

  async getApplicationStats(userId: number): Promise<{ total: number; pending: number; interviewed: number; }> {
    const stats = await db
      .select({
        total: count(),
        pending: sql<number>`COUNT(CASE WHEN ${applications.status} = 'pending' THEN 1 END)`,
        interviewed: sql<number>`COUNT(CASE WHEN ${applications.status} = 'interview' THEN 1 END)`,
      })
      .from(applications)
      .where(eq(applications.userId, userId));

    return stats[0] || { total: 0, pending: 0, interviewed: 0 };
  }

  // Company methods
  async getCompany(id: number): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company || undefined;
  }

  async getCompanyByName(name: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.name, name));
    return company || undefined;
  }

  async createCompany(insertCompany: InsertCompany): Promise<Company> {
    const [company] = await db
      .insert(companies)
      .values(insertCompany)
      .returning();
    return company;
  }

  async updateCompany(id: number, updates: Partial<InsertCompany>): Promise<Company | undefined> {
    const [company] = await db
      .update(companies)
      .set(updates)
      .where(eq(companies.id, id))
      .returning();
    return company || undefined;
  }

  async getCompanies(limit = 50, offset = 0): Promise<Company[]> {
    return await db
      .select()
      .from(companies)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(companies.createdAt));
  }

  // Recruiter job methods
  async getRecruiterJob(id: number): Promise<RecruiterJob | undefined> {
    const [job] = await db.select().from(recruiterJobs).where(eq(recruiterJobs.id, id));
    return job || undefined;
  }

  async getRecruiterJobs(recruiterId: number, limit = 50): Promise<RecruiterJob[]> {
    return await db
      .select()
      .from(recruiterJobs)
      .where(eq(recruiterJobs.recruiterId, recruiterId))
      .limit(limit)
      .orderBy(desc(recruiterJobs.createdAt));
  }

  async getRecruiterJobsByCompany(companyId: number, limit = 50): Promise<RecruiterJob[]> {
    return await db
      .select()
      .from(recruiterJobs)
      .where(eq(recruiterJobs.companyId, companyId))
      .limit(limit)
      .orderBy(desc(recruiterJobs.createdAt));
  }

  async createRecruiterJob(insertJob: InsertRecruiterJob): Promise<RecruiterJob> {
    const [job] = await db
      .insert(recruiterJobs)
      .values(insertJob)
      .returning();
    return job;
  }

  async updateRecruiterJob(id: number, updates: Partial<InsertRecruiterJob>): Promise<RecruiterJob | undefined> {
    const [job] = await db
      .update(recruiterJobs)
      .set(updates)
      .where(eq(recruiterJobs.id, id))
      .returning();
    return job || undefined;
  }

  async deleteRecruiterJob(id: number): Promise<boolean> {
    const result = await db
      .delete(recruiterJobs)
      .where(eq(recruiterJobs.id, id));
    return result.rowCount > 0;
  }

  // Recruiter application methods
  async getRecruiterApplication(id: number): Promise<RecruiterApplication | undefined> {
    const [application] = await db.select().from(recruiterApplications).where(eq(recruiterApplications.id, id));
    return application || undefined;
  }

  async getRecruiterApplications(jobId: number, limit = 50): Promise<RecruiterApplication[]> {
    return await db
      .select()
      .from(recruiterApplications)
      .where(eq(recruiterApplications.jobId, jobId))
      .limit(limit)
      .orderBy(desc(recruiterApplications.appliedAt));
  }

  async getRecruiterApplicationsByCandidate(candidateId: number, limit = 50): Promise<RecruiterApplication[]> {
    return await db
      .select()
      .from(recruiterApplications)
      .where(eq(recruiterApplications.candidateId, candidateId))
      .limit(limit)
      .orderBy(desc(recruiterApplications.appliedAt));
  }

  async createRecruiterApplication(insertApplication: InsertRecruiterApplication): Promise<RecruiterApplication> {
    const [application] = await db
      .insert(recruiterApplications)
      .values(insertApplication)
      .returning();
    return application;
  }

  async updateRecruiterApplication(id: number, updates: Partial<InsertRecruiterApplication>): Promise<RecruiterApplication | undefined> {
    const [application] = await db
      .update(recruiterApplications)
      .set(updates)
      .where(eq(recruiterApplications.id, id))
      .returning();
    return application || undefined;
  }

  // Candidate shortlist methods
  async getCandidateShortlist(recruiterId: number, candidateId: number): Promise<CandidateShortlist | undefined> {
    const [shortlist] = await db
      .select()
      .from(candidateShortlists)
      .where(and(eq(candidateShortlists.recruiterId, recruiterId), eq(candidateShortlists.candidateId, candidateId)));
    return shortlist || undefined;
  }

  async getCandidateShortlists(recruiterId: number, limit = 50): Promise<CandidateShortlist[]> {
    return await db
      .select()
      .from(candidateShortlists)
      .where(eq(candidateShortlists.recruiterId, recruiterId))
      .limit(limit)
      .orderBy(desc(candidateShortlists.createdAt));
  }

  async createCandidateShortlist(insertShortlist: InsertCandidateShortlist): Promise<CandidateShortlist> {
    const [shortlist] = await db
      .insert(candidateShortlists)
      .values(insertShortlist)
      .returning();
    return shortlist;
  }

  async updateCandidateShortlist(id: number, updates: Partial<InsertCandidateShortlist>): Promise<CandidateShortlist | undefined> {
    const [shortlist] = await db
      .update(candidateShortlists)
      .set(updates)
      .where(eq(candidateShortlists.id, id))
      .returning();
    return shortlist || undefined;
  }

  async deleteCandidateShortlist(id: number): Promise<boolean> {
    const result = await db
      .delete(candidateShortlists)
      .where(eq(candidateShortlists.id, id));
    return result.rowCount > 0;
  }
}

export const storage = new DatabaseStorage();
