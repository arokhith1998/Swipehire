import type { User, Job } from "@shared/schema";
import { h1bVisaService } from "./h1bVisaService";

class JobMatcher {
  calculateMatchScore(user: User, job: Job): number {
    let skillMatch = 0;
    let titleMatch = 0;
    let locationMatch = 0;

    // Skill matching (50% weight)
    if (user.skills && user.skills.length > 0 && job.requirements && job.requirements.length > 0) {
      const userSkillsLower = user.skills.map(s => s.toLowerCase());
      const jobRequirementsLower = job.requirements.map(r => r.toLowerCase());
      
      const matches = jobRequirementsLower.filter(req => 
        userSkillsLower.some(skill => 
          skill.includes(req) || req.includes(skill)
        )
      );
      
      skillMatch = (matches.length / jobRequirementsLower.length) * 100;
    }

    // Title matching (30% weight)
    if (user.targetJobTitle && job.title) {
      const userTitleWords = user.targetJobTitle.toLowerCase().split(' ');
      const jobTitleWords = job.title.toLowerCase().split(' ');
      
      const commonWords = userTitleWords.filter(word => 
        jobTitleWords.some(jobWord => jobWord.includes(word) || word.includes(jobWord))
      );
      
      titleMatch = (commonWords.length / Math.max(userTitleWords.length, jobTitleWords.length)) * 100;
    }

    // Location matching (20% weight)
    if (user.preferredLocation && job.location) {
      const userLocation = user.preferredLocation.toLowerCase();
      const jobLocation = job.location.toLowerCase();
      
      if (userLocation.includes(jobLocation) || jobLocation.includes(userLocation)) {
        locationMatch = 100;
      } else if (user.remotePreference === 'remote' && (job.isRemote || job.isHybrid)) {
        locationMatch = 90;
      } else {
        locationMatch = 30; // Base score for location mismatch
      }
    } else if (user.remotePreference === 'remote' && (job.isRemote || job.isHybrid)) {
      locationMatch = 100;
    }

    // Calculate weighted score
    const matchScore = (0.5 * skillMatch) + (0.3 * titleMatch) + (0.2 * locationMatch);
    
    return Math.min(Math.max(Math.round(matchScore), 0), 100);
  }

  calculateVisaScore(job: Job): number {
    // Use the comprehensive H1B visa service for accurate scoring
    const visaAnalysis = h1bVisaService.calculateVisaScore(job);
    return visaAnalysis.score;
  }
}

export const jobMatcher = new JobMatcher();
