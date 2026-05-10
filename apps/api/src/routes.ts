import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertUserSchema, 
  insertUserJobInteractionSchema, 
  insertApplicationSchema,
  insertCompanySchema,
  insertRecruiterJobSchema,
  insertRecruiterApplicationSchema,
  insertCandidateShortlistSchema
} from "@shared/schema";
import { z } from "zod";
import { resumeParser } from "./services/resumeParser";
import { jobMatcher } from "./services/jobMatcher";
import { openaiService } from "./services/openai";
import { jobAggregator } from "./services/jobAggregator";
import { enhancedJobAggregator } from "./services/enhancedJobAggregator";
import { jobDigestService } from "./services/jobDigest";
import { h1bVisaService } from "./services/h1bVisaService";
import multer from "multer";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

const upload = multer({ storage: multer.memoryStorage() });

// Passport configuration
passport.use(new LocalStrategy(
  { usernameField: 'email' },
  async (email, password, done) => {
    try {
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return done(null, false, { message: 'Invalid credentials' });
      }
      
      if (!user.password) {
        return done(null, false, { message: 'Please use Google login for this account' });
      }
      
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return done(null, false, { message: 'Invalid credentials' });
      }
      
      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }
));

// Google OAuth strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://swipehire.io/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if user already exists with this Google ID
      let user = await storage.getUserByGoogleId(profile.id);
      
      if (user) {
        return done(null, user);
      }
      
      // Check if user exists with same email
      const email = profile.emails?.[0]?.value;
      if (email) {
        user = await storage.getUserByEmail(email);
        if (user) {
          // Link Google account to existing user
          await storage.updateUser(user.id, { googleId: profile.id });
          return done(null, user);
        }
      }
      
      // Create new user
      if (email) {
        const newUser = await storage.createUser({
          email,
          googleId: profile.id,
          firstName: profile.name?.givenName || '',
          lastName: profile.name?.familyName || '',
        });
        return done(null, newUser);
      }
      
      return done(new Error('No email provided by Google'));
    } catch (error) {
      return done(error);
    }
  }));
}

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await storage.getUser(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Session middleware
  app.use(session({
    secret: process.env.SESSION_SECRET || 'swipehire-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  // Auth middleware
  const requireAuth = (req: any, res: any, next: any) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: 'Authentication required' });
  };

  const requireRecruiterRole = (req: any, res: any, next: any) => {
    if (req.isAuthenticated() && (req.user.userType === 'recruiter' || req.user.userType === 'admin')) {
      return next();
    }
    res.status(403).json({ message: 'Access denied. Recruiter role required.' });
  };

  // Auth routes
  app.post('/api/auth/register', async (req, res) => {
    try {
      const registerSchema = insertUserSchema.extend({
        confirmPassword: z.string()
      }).refine(data => data.password === data.confirmPassword, {
        message: "Passwords don't match",
      });

      const userData = registerSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ message: 'User already exists' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 12);
      
      const user = await storage.createUser({
        ...userData,
        password: hashedPassword
      });

      // Remove password from response
      const { password, ...userResponse } = user;
      res.json({ user: userResponse });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/auth/login', passport.authenticate('local'), (req, res) => {
    const { password, ...userResponse } = req.user as any;
    res.json({ user: userResponse });
  });

  app.post('/api/auth/logout', (req, res) => {
    req.logout(() => {
      res.json({ message: 'Logged out successfully' });
    });
  });

  // Profile routes
  app.post("/api/profile", requireAuth, async (req, res) => {
    try {
      const {
        firstName,
        lastName,
        email,
        phone,
        location,
        visaStatus,
        jobTitle,
        experience,
        expectedSalary,
        bio,
        skills,
        education,
        profilePicture
      } = req.body;

      // Get current user from session
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Update user profile
      const updatedUser = await storage.updateUser(userId, {
        firstName,
        lastName,
        email,
        phone,
        location,
        visaStatus,
        jobTitle,
        experience,
        expectedSalary,
        bio,
        skills,
        education,
        profilePicture,
        isProfileComplete: true
      });

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const { password, ...userResponse } = updatedUser;
      res.json(userResponse);
    } catch (error) {
      console.error("Profile creation error:", error);
      res.status(500).json({ message: "Failed to create profile" });
    }
  });

  app.get("/api/profile", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { password, ...userResponse } = user;
      res.json(userResponse);
    } catch (error) {
      console.error("Get profile error:", error);
      res.status(500).json({ message: "Failed to get profile" });
    }
  });

  app.get('/api/auth/me', (req, res) => {
    if (req.isAuthenticated()) {
      const { password, ...userResponse } = req.user as any;
      res.json({ user: userResponse });
    } else {
      res.status(401).json({ message: 'Not authenticated' });
    }
  });

  // Google OAuth routes
  if (process.env.GOOGLE_CLIENT_ID) {
    app.get('/auth/google', passport.authenticate('google', { 
      scope: ['profile', 'email'] 
    }));

    app.get('/auth/google/callback', 
      passport.authenticate('google', { failureRedirect: '/?error=google_login_failed' }),
      (req, res) => {
        // Successful authentication, redirect to home (App.tsx will handle routing)
        res.redirect('/');
      }
    );
  }

  // User profile routes
  app.patch('/api/profile', requireAuth, async (req, res) => {
    try {
      const updateSchema = insertUserSchema.partial().omit({ password: true });
      const updates = updateSchema.parse(req.body);
      
      const updatedUser = await storage.updateUser((req.user as any).id, updates);
      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      const { password, ...userResponse } = updatedUser;
      res.json({ user: userResponse });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  // Resume upload and parsing
  app.post('/api/resume/upload', requireAuth, upload.single('resume'), async (req, res) => {
    try {
      console.log('Resume upload request received');
      console.log('User authenticated:', req.isAuthenticated());
      console.log('User ID:', (req.user as any)?.id);
      
      if (!req.file) {
        return res.status(400).json({ message: 'No resume file provided' });
      }

      const parsedData = await resumeParser.parseResume(req.file.buffer, req.file.originalname);
      
      // Update user with parsed resume data and original content
      const updatedUser = await storage.updateUser((req.user as any).id, {
        resumeData: parsedData,
        originalResumeContent: parsedData.originalContent,
        skills: parsedData.skills || []
      });

      console.log('Resume uploaded successfully for user:', (req.user as any).id);
      res.json({ 
        resumeData: parsedData,
        message: 'Resume uploaded successfully'
      });
    } catch (error) {
      console.error('Resume upload error:', error);
      res.status(500).json({ message: 'Failed to parse resume: ' + error.message });
    }
  });

  // Admin endpoint to get all users
  app.get('/api/admin/users', requireAuth, async (req, res) => {
    try {
      const currentUser = req.user as any;
      if (currentUser.userType !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }
      
      const users = await storage.getUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin endpoint to set user roles
  app.post('/api/admin/set-role', requireAuth, async (req, res) => {
    try {
      const currentUser = req.user as any;
      if (currentUser.userType !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }
      
      const { userId, role } = req.body;
      if (!userId || !role) {
        return res.status(400).json({ message: 'userId and role are required' });
      }
      
      if (!['candidate', 'recruiter', 'admin'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role. Must be candidate, recruiter, or admin' });
      }
      
      const updatedUser = await storage.updateUser(userId, { userType: role });
      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      res.json({ message: 'Role updated successfully', user: { id: updatedUser.id, userType: updatedUser.userType } });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Job feed
  app.get('/api/jobs/feed', requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const limit = parseInt(req.query.limit as string) || 20;
      
      const jobs = await storage.getJobsForUser(userId, limit);
      const user = await storage.getUser(userId);
      
      // Calculate match scores for each job
      const jobsWithScores = await Promise.all(
        jobs.map(async (job) => {
          const matchScore = jobMatcher.calculateMatchScore(user!, job);
          const visaScore = user!.visaStatus && user!.visaStatus !== 'citizen' 
            ? jobMatcher.calculateVisaScore(job) 
            : null;
          
          return {
            ...job,
            matchScore,
            visaScore
          };
        })
      );

      // Sort by match score
      jobsWithScores.sort((a, b) => b.matchScore - a.matchScore);
      
      res.json({ jobs: jobsWithScores });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Job interaction (swipe)
  app.post('/api/jobs/:jobId/interact', requireAuth, async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const userId = (req.user as any).id;
      
      const interactionData = insertUserJobInteractionSchema.parse({
        ...req.body,
        userId,
        jobId
      });

      const interaction = await storage.createInteraction(interactionData);
      
      // If user swiped right, trigger resume tailoring
      if (interactionData.action === 'swipe_right') {
        const job = await storage.getJob(jobId);
        const user = await storage.getUser(userId);
        
        if (job && user && user.resumeData) {
          try {
            // Use original content if available, otherwise use parsed data
            const resumeDataWithOriginal = {
              ...user.resumeData,
              originalContent: user.originalResumeContent || undefined
            };
            
            const tailoredResume = await openaiService.tailorResume(
              resumeDataWithOriginal,
              job.description,
              job.requirements || []
            );
            
            // Update interaction with tailored resume
            await storage.createInteraction({
              ...interactionData,
              tailoredResumeData: tailoredResume
            });
            
            res.json({ 
              interaction, 
              tailoredResume,
              showResumeTailoringModal: true 
            });
          } catch (error) {
            res.json({ 
              interaction,
              showResumeTailoringModal: true,
              tailoringError: 'Failed to tailor resume automatically'
            });
          }
        } else {
          res.json({ interaction });
        }
      } else {
        res.json({ interaction });
      }
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  // Apply to job
  app.post('/api/jobs/:jobId/apply', requireAuth, async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const userId = (req.user as any).id;
      
      // Check if already applied
      const existingApplications = await storage.getUserApplications(userId);
      const alreadyApplied = existingApplications.some(app => app.jobId === jobId);
      
      if (alreadyApplied) {
        return res.status(400).json({ message: 'Already applied to this job' });
      }

      // Get or create interaction
      let interaction = await storage.getInteractionByUserAndJob(userId, jobId);
      if (!interaction) {
        interaction = await storage.createInteraction({
          userId,
          jobId,
          action: 'apply'
        });
      }

      // Get tailored resume from interaction if available
      const resumeData = interaction.tailoredResumeData as any;
      const resumeContent = resumeData?.content || 'Original Resume';
      const resumeVersion = resumeData ? 'tailored' : 'original';

      const application = await storage.createApplication({
        userId,
        jobId,
        interactionId: interaction.id,
        status: 'pending',
        resumeVersion,
        resumeContent
      });

      res.json({ application });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  // Dashboard data
  app.get('/api/dashboard/stats', requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      
      const [applications, interactions, stats] = await Promise.all([
        storage.getUserApplications(userId),
        storage.getUserInteractions(userId),
        storage.getApplicationStats(userId)
      ]);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayInteractions = interactions.filter(interaction => 
        new Date(interaction.createdAt!) >= today
      );

      const todayStats = {
        viewed: todayInteractions.length,
        liked: todayInteractions.filter(i => i.action === 'swipe_right').length,
        applied: applications.filter(app => 
          new Date(app.appliedAt!) >= today
        ).length
      };

      res.json({
        totalApplications: stats.total,
        responseRate: stats.total > 0 ? Math.round((stats.interviewed / stats.total) * 100) : 0,
        recentApplications: applications.slice(0, 10),
        todayStats
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Seed some sample companies (for development)
  app.post('/api/admin/seed-companies', async (req, res) => {
    try {
      const sampleCompanies = [
        {
          name: "TechCorp Solutions",
          description: "Leading software development company",
          website: "https://techcorp.com",
          industry: "Technology",
          size: "500-1000",
          location: "San Francisco, CA",
          logo: null,
          benefits: ["Health Insurance", "401k", "Remote Work", "Stock Options"],
          culture: "Fast-paced, innovative environment",
          founded: "2010",
          sponsorsVisa: true,
          h1bApprovalRate: "78.5",
          recentSponsorshipCount: 45
        },
        {
          name: "InnovateLabs",
          description: "AI and machine learning research company",
          website: "https://innovatelabs.com",
          industry: "Artificial Intelligence",
          size: "100-500",
          location: "Boston, MA",
          logo: null,
          benefits: ["Health Insurance", "Flexible Hours", "Learning Budget", "Stock Options"],
          culture: "Research-focused, collaborative environment",
          founded: "2015",
          sponsorsVisa: true,
          h1bApprovalRate: "82.3",
          recentSponsorshipCount: 23
        },
        {
          name: "GlobalTech Inc",
          description: "Enterprise software solutions provider",
          website: "https://globaltech.com",
          industry: "Enterprise Software",
          size: "1000+",
          location: "Seattle, WA",
          logo: null,
          benefits: ["Health Insurance", "401k", "Parental Leave", "Stock Options", "Gym Membership"],
          culture: "Diverse, inclusive workplace",
          founded: "2005",
          sponsorsVisa: true,
          h1bApprovalRate: "75.8",
          recentSponsorshipCount: 67
        }
      ];

      const createdCompanies = await Promise.all(
        sampleCompanies.map(company => storage.createCompany(company))
      );

      res.json({ message: `Created ${createdCompanies.length} sample companies`, companies: createdCompanies });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Seed some sample jobs (for development)
  app.post('/api/admin/seed-jobs', async (req, res) => {
    try {
      const sampleJobs = [
        {
          title: "Senior Software Engineer",
          company: "Google",
          location: "Mountain View, CA",
          description: "Join our team to build scalable systems that serve billions of users.",
          requirements: ["Python", "System Design", "5+ years experience"],
          salaryMin: 160000,
          salaryMax: 250000,
          type: "full-time",
          isRemote: false,
          isHybrid: true,
          sponsorsVisa: true,
          h1bApprovalRate: "85.5",
          recentSponsorshipCount: 120,
          externalUrl: "https://careers.google.com/jobs"
        },
        {
          title: "Full Stack Developer",
          company: "Microsoft",
          location: "Seattle, WA",
          description: "Build modern web applications using cutting-edge technologies.",
          requirements: ["JavaScript", "React", "Node.js", "3+ years experience"],
          salaryMin: 140000,
          salaryMax: 200000,
          type: "full-time",
          isRemote: true,
          isHybrid: false,
          sponsorsVisa: true,
          h1bApprovalRate: "78.2",
          recentSponsorshipCount: 95,
          externalUrl: "https://careers.microsoft.com"
        },
        {
          title: "Backend Engineer",
          company: "Meta",
          location: "Menlo Park, CA",
          description: "Scale backend systems for social media platforms.",
          requirements: ["Java", "Distributed Systems", "4+ years experience"],
          salaryMin: 150000,
          salaryMax: 230000,
          type: "full-time",
          isRemote: false,
          isHybrid: true,
          sponsorsVisa: true,
          h1bApprovalRate: "82.1",
          recentSponsorshipCount: 87,
          externalUrl: "https://www.metacareers.com"
        }
      ];

      const createdJobs = await Promise.all(
        sampleJobs.map(job => storage.createJob(job))
      );

      res.json({ message: `Created ${createdJobs.length} sample jobs`, jobs: createdJobs });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Job aggregation routes
  app.post('/api/admin/aggregate-jobs', async (req, res) => {
    try {
      const result = await jobAggregator.aggregateJobs(50);
      res.json({
        message: `Job aggregation completed: ${result.jobs.length} new jobs added`,
        success: result.success,
        failed: result.failed,
        jobs: result.jobs
      });
    } catch (error) {
      res.status(500).json({ message: `Job aggregation failed: ${error.message}` });
    }
  });

  app.post('/api/admin/refresh-jobs', async (req, res) => {
    try {
      await jobAggregator.refreshJobData();
      res.json({ message: "Job data refresh initiated successfully" });
    } catch (error) {
      res.status(500).json({ message: `Job refresh failed: ${error.message}` });
    }
  });

  app.get('/api/admin/jobs', async (req, res) => {
    try {
      const jobs = await storage.getJobs(100);
      res.json({ jobs, count: jobs.length });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Enhanced job aggregation endpoint (scrapes all platforms and career pages)
  app.post('/api/admin/enhanced-aggregation', async (req, res) => {
    try {
      const query = req.body.query || 'software engineer visa sponsorship';
      const limit = parseInt(req.body.limit as string) || 200;
      
      console.log(`Starting enhanced job aggregation for query: "${query}" with limit: ${limit}`);
      const result = await enhancedJobAggregator.aggregateJobs(query, limit);
      
      res.json({ 
        message: `Enhanced job aggregation completed: ${result.jobs.length} new jobs added`,
        success: result.success,
        failed: result.failed,
        totalJobs: result.jobs.length,
        jobs: result.jobs.slice(0, 10) // Return first 10 jobs as preview
      });
    } catch (error) {
      console.error('Enhanced job aggregation error:', error);
      res.status(500).json({ message: 'Failed to run enhanced job aggregation: ' + error.message });
    }
  });

  // H1B visa analysis endpoints
  app.get('/api/visa/company/:companyName', async (req, res) => {
    try {
      const companyName = req.params.companyName;
      const h1bData = h1bVisaService.getH1BEmployerData(companyName);
      const graderData = h1bVisaService.getH1BGraderData(companyName);
      
      res.json({
        company: companyName,
        h1bData,
        graderData,
        hasData: !!(h1bData || graderData)
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get('/api/visa/top-sponsors', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const activeSponsors = h1bVisaService.getActiveH1BSponsors();
      const topCompanies = h1bVisaService.getTopH1BCompanies(limit);
      
      res.json({
        activeSponsors: activeSponsors.slice(0, limit),
        topCompanies,
        totalActiveSponsors: activeSponsors.length
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get('/api/visa/search', async (req, res) => {
    try {
      const query = req.query.q as string || '';
      const minScore = parseInt(req.query.minScore as string) || 80;
      
      const companies = h1bVisaService.searchH1BFriendlyCompanies(query, minScore);
      
      res.json({
        query,
        minScore,
        companies,
        count: companies.length
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Recruiter API routes
  
  // Company management
  app.get('/api/companies', requireRecruiterRole, async (req, res) => {
    try {
      const companies = await storage.getCompanies();
      res.json({ companies });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post('/api/companies', requireRecruiterRole, async (req, res) => {
    try {
      const companyData = insertCompanySchema.parse(req.body);
      const company = await storage.createCompany(companyData);
      res.json({ company });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/companies/:id', requireRecruiterRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const company = await storage.getCompany(id);
      if (!company) {
        return res.status(404).json({ message: 'Company not found' });
      }
      res.json({ company });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch('/api/companies/:id', requireRecruiterRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = insertCompanySchema.partial().parse(req.body);
      const company = await storage.updateCompany(id, updates);
      if (!company) {
        return res.status(404).json({ message: 'Company not found' });
      }
      res.json({ company });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  // Recruiter job management
  app.get('/api/recruiter/jobs', requireRecruiterRole, async (req, res) => {
    try {
      const recruiterId = (req.user as any).id;
      const jobs = await storage.getRecruiterJobs(recruiterId);
      res.json({ jobs });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post('/api/recruiter/jobs', requireRecruiterRole, async (req, res) => {
    try {
      const recruiterId = (req.user as any).id;
      const jobData = insertRecruiterJobSchema.parse({
        ...req.body,
        recruiterId
      });
      const job = await storage.createRecruiterJob(jobData);
      res.json({ job });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/recruiter/jobs/:id', requireRecruiterRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const job = await storage.getRecruiterJob(id);
      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }
      res.json({ job });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch('/api/recruiter/jobs/:id', requireRecruiterRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = insertRecruiterJobSchema.partial().parse(req.body);
      const job = await storage.updateRecruiterJob(id, updates);
      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }
      res.json({ job });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete('/api/recruiter/jobs/:id', requireRecruiterRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteRecruiterJob(id);
      if (!deleted) {
        return res.status(404).json({ message: 'Job not found' });
      }
      res.json({ message: 'Job deleted successfully' });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Recruiter application management
  app.get('/api/recruiter/jobs/:jobId/applications', requireRecruiterRole, async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const applications = await storage.getRecruiterApplications(jobId);
      res.json({ applications });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch('/api/recruiter/applications/:id', requireRecruiterRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = insertRecruiterApplicationSchema.partial().parse(req.body);
      const application = await storage.updateRecruiterApplication(id, updates);
      if (!application) {
        return res.status(404).json({ message: 'Application not found' });
      }
      res.json({ application });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  // Candidate shortlist management
  app.get('/api/recruiter/shortlists', requireRecruiterRole, async (req, res) => {
    try {
      const recruiterId = (req.user as any).id;
      const shortlists = await storage.getCandidateShortlists(recruiterId);
      res.json({ shortlists });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post('/api/recruiter/shortlists', requireRecruiterRole, async (req, res) => {
    try {
      const recruiterId = (req.user as any).id;
      const shortlistData = insertCandidateShortlistSchema.parse({
        ...req.body,
        recruiterId
      });
      const shortlist = await storage.createCandidateShortlist(shortlistData);
      res.json({ shortlist });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete('/api/recruiter/shortlists/:id', requireRecruiterRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteCandidateShortlist(id);
      if (!deleted) {
        return res.status(404).json({ message: 'Shortlist entry not found' });
      }
      res.json({ message: 'Removed from shortlist' });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Candidate matching for recruiters
  app.get('/api/recruiter/candidates/search', requireRecruiterRole, async (req, res) => {
    try {
      const { skills, location, experience, visaStatus } = req.query;
      
      // Simple candidate search - in production would use more sophisticated matching
      const candidates = await storage.getUsers();
      
      // Filter candidates based on criteria
      const filteredCandidates = candidates.filter(candidate => {
        if (skills && candidate.skills) {
          const candidateSkills = candidate.skills.map(s => s.toLowerCase());
          const searchSkills = (skills as string).split(',').map(s => s.trim().toLowerCase());
          if (!searchSkills.some(skill => candidateSkills.includes(skill))) {
            return false;
          }
        }
        
        if (location && candidate.location) {
          if (!candidate.location.toLowerCase().includes((location as string).toLowerCase())) {
            return false;
          }
        }
        
        if (experience && candidate.experience) {
          if (candidate.experience !== experience) {
            return false;
          }
        }
        
        if (visaStatus && candidate.visaStatus) {
          if (candidate.visaStatus !== visaStatus) {
            return false;
          }
        }
        
        return true;
      });
      
      // Remove sensitive information
      const safeCandidates = filteredCandidates.map(candidate => ({
        id: candidate.id,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        location: candidate.location,
        jobTitle: candidate.jobTitle,
        experience: candidate.experience,
        skills: candidate.skills,
        bio: candidate.bio,
        visaStatus: candidate.visaStatus,
        profilePicture: candidate.profilePicture,
      }));
      
      res.json({ candidates: safeCandidates });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
