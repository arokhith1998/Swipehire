/**
 * Beta demo jobs — handful of realistic postings so the v2 scorer has
 * something to rank when developers/testers first log in.
 *
 * Idempotent: jobs with matching (title, company) are skipped.
 */
import type { Database } from '../index.js';
import { jobs } from '../schema/v1.js';
import { sql } from 'drizzle-orm';

interface DemoJob {
  title: string;
  company: string;
  location: string;
  description: string;
  requirements: string[];
  salaryMin?: number;
  salaryMax?: number;
  type?: string;
  isRemote?: boolean;
  isHybrid?: boolean;
  sponsorsVisa?: boolean;
  externalUrl?: string;
}

const DEMO: DemoJob[] = [
  {
    title: 'Senior Software Engineer, Backend',
    company: 'Stripe',
    location: 'San Francisco, CA',
    description:
      'Build the systems that move money for millions of businesses. You will work on payment processing infrastructure, optimize for reliability, and own services end-to-end. Our fintech platform handles billions of API requests per month.',
    requirements: ['Go', 'TypeScript', 'PostgreSQL', 'Kafka', 'AWS', 'distributed systems'],
    salaryMin: 195000,
    salaryMax: 270000,
    type: 'full-time',
    isHybrid: true,
    sponsorsVisa: true,
    externalUrl: 'https://stripe.com/jobs',
  },
  {
    title: 'Software Engineer, New Grad',
    company: 'Datadog',
    location: 'New York, NY',
    description:
      'Join our observability platform team. We are looking for new graduates excited about building large-scale distributed systems. You will write Python and Go services that ingest billions of metrics per second from b2b saas customers.',
    requirements: ['Python', 'Go', 'SQL', 'Linux', 'computer science fundamentals'],
    salaryMin: 130000,
    salaryMax: 165000,
    type: 'full-time',
    isHybrid: true,
    sponsorsVisa: true,
    externalUrl: 'https://www.datadoghq.com/careers/',
  },
  {
    title: 'Full Stack Engineer (Remote)',
    company: 'Vercel',
    location: 'Remote',
    description:
      'Build the future of frontend cloud. You will work on the deployment platform used by millions of developers. We love TypeScript, React, Node.js, and shipping fast.',
    requirements: ['TypeScript', 'React', 'Node.js', 'Next.js', 'AWS'],
    salaryMin: 170000,
    salaryMax: 240000,
    type: 'full-time',
    isRemote: true,
    sponsorsVisa: true,
    externalUrl: 'https://vercel.com/careers',
  },
  {
    title: 'Data Scientist, Growth',
    company: 'Notion',
    location: 'San Francisco, CA',
    description:
      'Drive growth experimentation across our b2b saas product. You will design A/B tests, analyze cohort behavior in Mixpanel and Amplitude, and partner with PMs to make calibrated bets.',
    requirements: ['Python', 'SQL', 'A/B Testing', 'Mixpanel', 'Amplitude', 'statistics'],
    salaryMin: 165000,
    salaryMax: 215000,
    type: 'full-time',
    isHybrid: true,
    sponsorsVisa: true,
    externalUrl: 'https://www.notion.so/careers',
  },
  {
    title: 'Junior Frontend Developer',
    company: 'Linear',
    location: 'Remote',
    description:
      'Help us build the issue tracker that engineering teams actually love. You will work in TypeScript and React on a small team that ships every week. We care about craft.',
    requirements: ['TypeScript', 'React', 'CSS', 'attention to detail'],
    salaryMin: 110000,
    salaryMax: 145000,
    type: 'full-time',
    isRemote: true,
    sponsorsVisa: false,
    externalUrl: 'https://linear.app/careers',
  },
  {
    title: 'Machine Learning Engineer',
    company: 'Anthropic',
    location: 'San Francisco, CA',
    description:
      'Work on training and serving large language models. You will implement model inference optimizations, build evaluation pipelines in Python, and ship to production with Docker and Kubernetes.',
    requirements: ['Python', 'PyTorch', 'CUDA', 'Docker', 'Kubernetes', 'distributed training'],
    salaryMin: 280000,
    salaryMax: 410000,
    type: 'full-time',
    isHybrid: true,
    sponsorsVisa: true,
    externalUrl: 'https://www.anthropic.com/careers',
  },
  {
    title: 'Product Manager, Marketplace',
    company: 'Airbnb',
    location: 'Seattle, WA',
    description:
      'Own the search and discovery experience for our marketplace product. Partner with engineering and design to ship experiments that improve booking conversion.',
    requirements: ['product strategy', 'A/B Testing', 'SQL', 'user research', '5+ years'],
    salaryMin: 175000,
    salaryMax: 235000,
    type: 'full-time',
    isHybrid: true,
    sponsorsVisa: true,
    externalUrl: 'https://careers.airbnb.com',
  },
  {
    title: 'Site Reliability Engineer',
    company: 'Cloudflare',
    location: 'Austin, TX',
    description:
      'Keep our edge network fast and reliable. You will own incident response, build automation in Go and Python, and work with Kubernetes at planetary scale.',
    requirements: ['Go', 'Python', 'Kubernetes', 'Linux', 'Terraform', 'incident response'],
    salaryMin: 160000,
    salaryMax: 215000,
    type: 'full-time',
    isHybrid: true,
    sponsorsVisa: true,
    externalUrl: 'https://www.cloudflare.com/careers/',
  },
  {
    title: 'Marketing Analytics Manager',
    company: 'HubSpot',
    location: 'Boston, MA',
    description:
      'Lead our marketing analytics function. Own the GA4, Google Ads, and Meta Ads attribution model. Partner with growth on campaign measurement.',
    requirements: ['Google Analytics', 'GA4', 'Google Ads', 'Meta Ads', 'HubSpot', 'SQL'],
    salaryMin: 130000,
    salaryMax: 175000,
    type: 'full-time',
    isHybrid: true,
    sponsorsVisa: false,
    externalUrl: 'https://www.hubspot.com/careers',
  },
  {
    title: 'Software Engineer Intern (Summer 2026)',
    company: 'Figma',
    location: 'San Francisco, CA',
    description:
      'Summer internship on the design tools team. Work alongside senior engineers on real product features in TypeScript and React. We want curious students who ship.',
    requirements: ['TypeScript', 'React', 'computer science fundamentals', 'currently enrolled'],
    salaryMin: 11000,
    salaryMax: 13000,
    type: 'intern',
    isHybrid: true,
    sponsorsVisa: false,
    externalUrl: 'https://www.figma.com/careers/',
  },
];

export async function seedDemoJobs(db: Database): Promise<number> {
  let inserted = 0;
  for (const j of DEMO) {
    const exists = await db.execute(sql`
      SELECT id FROM jobs WHERE title = ${j.title} AND company = ${j.company} LIMIT 1
    `);
    if (exists.rows.length > 0) continue;
    await db.insert(jobs).values({
      title: j.title,
      company: j.company,
      location: j.location,
      description: j.description,
      requirements: j.requirements,
      salaryMin: j.salaryMin,
      salaryMax: j.salaryMax,
      type: j.type,
      isRemote: j.isRemote ?? false,
      isHybrid: j.isHybrid ?? false,
      sponsorsVisa: j.sponsorsVisa ?? false,
      externalUrl: j.externalUrl,
    });
    inserted++;
  }
  return inserted;
}
