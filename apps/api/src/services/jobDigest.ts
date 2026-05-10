import { db } from "../db";
import { jobDigests, users, jobs } from "@shared/schema";
import { gte, eq, and, desc } from "drizzle-orm";

interface DigestJob {
  id: number;
  title: string;
  company: string;
  location: string;
  matchScore: number;
  visaSponsorship: boolean;
  createdAt: Date;
}

class JobDigestService {
  async generateDailyDigest(userId: number): Promise<DigestJob[]> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const newJobs = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        company: jobs.company,
        location: jobs.location,
        visaSponsorship: jobs.h1bLcaCount,
        createdAt: jobs.createdAt,
      })
      .from(jobs)
      .where(gte(jobs.createdAt, yesterday))
      .orderBy(desc(jobs.createdAt))
      .limit(10);

    await this.recordDigest(userId, 'daily', newJobs.length);
    
    return newJobs.map(job => ({
      ...job,
      matchScore: 85,
      visaSponsorship: Boolean(job.visaSponsorship && job.visaSponsorship > 0),
      createdAt: job.createdAt || new Date(),
    }));
  }

  async generateWeeklyDigest(userId: number): Promise<DigestJob[]> {
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    
    const newJobs = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        company: jobs.company,
        location: jobs.location,
        visaSponsorship: jobs.h1bLcaCount,
        createdAt: jobs.createdAt,
      })
      .from(jobs)
      .where(gte(jobs.createdAt, lastWeek))
      .orderBy(desc(jobs.createdAt))
      .limit(20);

    await this.recordDigest(userId, 'weekly', newJobs.length);
    
    return newJobs.map(job => ({
      ...job,
      matchScore: 85,
      visaSponsorship: Boolean(job.visaSponsorship && job.visaSponsorship > 0),
      createdAt: job.createdAt || new Date(),
    }));
  }

  private async recordDigest(userId: number, digestType: 'daily' | 'weekly', jobCount: number): Promise<void> {
    await db.insert(jobDigests).values({
      userId,
      digestType,
      jobCount,
      lastJobDate: new Date(),
    });
  }

  async getUserDigestHistory(userId: number): Promise<any[]> {
    return await db
      .select()
      .from(jobDigests)
      .where(eq(jobDigests.userId, userId))
      .orderBy(desc(jobDigests.sentAt))
      .limit(10);
  }

  async shouldSendDailyDigest(userId: number): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const existingDigest = await db
      .select()
      .from(jobDigests)
      .where(
        and(
          eq(jobDigests.userId, userId),
          eq(jobDigests.digestType, 'daily'),
          gte(jobDigests.sentAt, today)
        )
      )
      .limit(1);

    return existingDigest.length === 0;
  }

  async shouldSendWeeklyDigest(userId: number): Promise<boolean> {
    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() - 7);
    thisWeek.setHours(0, 0, 0, 0);
    
    const existingDigest = await db
      .select()
      .from(jobDigests)
      .where(
        and(
          eq(jobDigests.userId, userId),
          eq(jobDigests.digestType, 'weekly'),
          gte(jobDigests.sentAt, thisWeek)
        )
      )
      .limit(1);

    return existingDigest.length === 0;
  }
}

export const jobDigestService = new JobDigestService();