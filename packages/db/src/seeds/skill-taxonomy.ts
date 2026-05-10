/**
 * Seed canonical skill taxonomy.
 *
 * Embeddings are NOT seeded here — they are backfilled by the ml-sidecar
 * the first time it starts (see apps/ml-sidecar/main.py /admin/backfill).
 *
 * This is a starter set focused on Adhithya's first-user targeting
 * (marketing, product, pricing) plus broad coverage of common tech skills.
 *
 * Production target: ~5,000 canonical skills sourced from ESCO + LinkedIn
 * Skill Graph + manual curation. The taxonomy will grow with the corpus.
 */
import type { Database } from '../index.js';
import { skillTaxonomy } from '../schema/v2.js';

interface SkillSeed {
  canonical: string;
  aliases: string[];
  category: 'language' | 'framework' | 'tool' | 'platform' | 'soft' | 'domain' | 'method';
}

const SEED_SKILLS: SkillSeed[] = [
  // === Marketing tools & platforms ===
  { canonical: 'Google Analytics', aliases: ['GA', 'GA4', 'Google Analytics 4', 'Google Analytics 360'], category: 'platform' },
  { canonical: 'Google Ads', aliases: ['Google AdWords', 'AdWords', 'Google Search Ads'], category: 'platform' },
  { canonical: 'Meta Ads', aliases: ['Facebook Ads', 'Instagram Ads', 'Meta Ads Manager'], category: 'platform' },
  { canonical: 'TikTok Ads', aliases: ['TikTok for Business'], category: 'platform' },
  { canonical: 'LinkedIn Ads', aliases: ['LinkedIn Campaign Manager'], category: 'platform' },
  { canonical: 'Salesforce Marketing Cloud', aliases: ['SFMC', 'Marketing Cloud'], category: 'platform' },
  { canonical: 'HubSpot', aliases: ['HubSpot CRM', 'HubSpot Marketing Hub'], category: 'platform' },
  { canonical: 'Marketo', aliases: ['Adobe Marketo', 'Marketo Engage'], category: 'platform' },
  { canonical: 'Iterable', aliases: [], category: 'platform' },
  { canonical: 'Braze', aliases: [], category: 'platform' },
  { canonical: 'Customer.io', aliases: [], category: 'platform' },
  { canonical: 'Klaviyo', aliases: [], category: 'platform' },
  { canonical: 'Mailchimp', aliases: [], category: 'platform' },
  { canonical: 'Segment', aliases: ['Twilio Segment'], category: 'platform' },
  { canonical: 'Mixpanel', aliases: [], category: 'platform' },
  { canonical: 'Amplitude', aliases: [], category: 'platform' },
  { canonical: 'Heap', aliases: ['Heap Analytics'], category: 'platform' },
  { canonical: 'Looker', aliases: ['Looker Studio'], category: 'platform' },
  { canonical: 'Tableau', aliases: [], category: 'platform' },
  { canonical: 'Power BI', aliases: ['PowerBI', 'Microsoft Power BI'], category: 'platform' },
  { canonical: 'Optimizely', aliases: [], category: 'platform' },
  { canonical: 'VWO', aliases: ['Visual Website Optimizer'], category: 'platform' },
  { canonical: 'Branch', aliases: ['Branch.io'], category: 'platform' },
  { canonical: 'AppsFlyer', aliases: [], category: 'platform' },
  { canonical: 'Adjust', aliases: [], category: 'platform' },

  // === Marketing methods ===
  { canonical: 'A/B Testing', aliases: ['Split Testing', 'AB Testing', 'Experimentation'], category: 'method' },
  { canonical: 'Conversion Rate Optimization', aliases: ['CRO', 'Conversion Optimization'], category: 'method' },
  { canonical: 'Search Engine Optimization', aliases: ['SEO', 'Organic Search'], category: 'method' },
  { canonical: 'Search Engine Marketing', aliases: ['SEM', 'Paid Search'], category: 'method' },
  { canonical: 'Programmatic Advertising', aliases: ['Programmatic Media', 'RTB', 'Real-Time Bidding'], category: 'method' },
  { canonical: 'Attribution Modeling', aliases: ['Multi-Touch Attribution', 'MTA', 'Attribution'], category: 'method' },
  { canonical: 'Marketing Mix Modeling', aliases: ['MMM', 'Media Mix Modeling'], category: 'method' },
  { canonical: 'Retention Marketing', aliases: ['Lifecycle Marketing', 'CRM Marketing'], category: 'method' },
  { canonical: 'Cohort Analysis', aliases: [], category: 'method' },
  { canonical: 'Funnel Analysis', aliases: ['Funnel Optimization'], category: 'method' },
  { canonical: 'Customer Segmentation', aliases: ['Audience Segmentation'], category: 'method' },
  { canonical: 'Lead Generation', aliases: ['Lead Gen', 'Demand Generation', 'Demand Gen'], category: 'method' },
  { canonical: 'Account-Based Marketing', aliases: ['ABM'], category: 'method' },
  { canonical: 'Influencer Marketing', aliases: [], category: 'method' },
  { canonical: 'Affiliate Marketing', aliases: ['Affiliate Programs'], category: 'method' },

  // === Product / PM ===
  { canonical: 'Product Strategy', aliases: ['PM Strategy'], category: 'method' },
  { canonical: 'Product Roadmap', aliases: ['Roadmapping'], category: 'method' },
  { canonical: 'User Research', aliases: ['UX Research', 'Customer Research'], category: 'method' },
  { canonical: 'Product Discovery', aliases: ['Continuous Discovery'], category: 'method' },
  { canonical: 'Wireframing', aliases: [], category: 'method' },
  { canonical: 'Figma', aliases: [], category: 'tool' },
  { canonical: 'Notion', aliases: [], category: 'tool' },
  { canonical: 'Linear', aliases: [], category: 'tool' },
  { canonical: 'Jira', aliases: [], category: 'tool' },
  { canonical: 'Asana', aliases: [], category: 'tool' },

  // === Pricing ===
  { canonical: 'Pricing Strategy', aliases: ['Monetization Strategy'], category: 'method' },
  { canonical: 'Revenue Management', aliases: ['Revenue Optimization'], category: 'method' },
  { canonical: 'Willingness to Pay Analysis', aliases: ['WTP', 'Van Westendorp'], category: 'method' },
  { canonical: 'Conjoint Analysis', aliases: [], category: 'method' },
  { canonical: 'Subscription Pricing', aliases: ['SaaS Pricing'], category: 'method' },
  { canonical: 'Discount Strategy', aliases: ['Promotion Strategy'], category: 'method' },
  { canonical: 'Margin Analysis', aliases: [], category: 'method' },

  // === Languages (broad audience) ===
  { canonical: 'Python', aliases: ['Python 3', 'Python3'], category: 'language' },
  { canonical: 'JavaScript', aliases: ['JS', 'ECMAScript'], category: 'language' },
  { canonical: 'TypeScript', aliases: ['TS'], category: 'language' },
  { canonical: 'Java', aliases: [], category: 'language' },
  { canonical: 'Go', aliases: ['Golang'], category: 'language' },
  { canonical: 'Rust', aliases: [], category: 'language' },
  { canonical: 'C++', aliases: ['Cpp', 'C plus plus'], category: 'language' },
  { canonical: 'C#', aliases: ['CSharp'], category: 'language' },
  { canonical: 'Ruby', aliases: [], category: 'language' },
  { canonical: 'PHP', aliases: [], category: 'language' },
  { canonical: 'SQL', aliases: ['Structured Query Language'], category: 'language' },
  { canonical: 'R', aliases: [], category: 'language' },

  // === Frameworks / runtimes ===
  { canonical: 'React', aliases: ['ReactJS', 'React.js'], category: 'framework' },
  { canonical: 'Next.js', aliases: ['NextJS'], category: 'framework' },
  { canonical: 'Vue.js', aliases: ['Vue', 'VueJS'], category: 'framework' },
  { canonical: 'Node.js', aliases: ['NodeJS', 'Node'], category: 'framework' },
  { canonical: 'Django', aliases: [], category: 'framework' },
  { canonical: 'Flask', aliases: [], category: 'framework' },
  { canonical: 'FastAPI', aliases: [], category: 'framework' },
  { canonical: 'Spring Boot', aliases: ['Spring'], category: 'framework' },
  { canonical: 'Express', aliases: ['ExpressJS', 'Express.js'], category: 'framework' },

  // === Data / ML ===
  { canonical: 'PostgreSQL', aliases: ['Postgres'], category: 'tool' },
  { canonical: 'MySQL', aliases: [], category: 'tool' },
  { canonical: 'MongoDB', aliases: [], category: 'tool' },
  { canonical: 'Redis', aliases: [], category: 'tool' },
  { canonical: 'Kafka', aliases: ['Apache Kafka'], category: 'tool' },
  { canonical: 'Spark', aliases: ['Apache Spark', 'PySpark'], category: 'tool' },
  { canonical: 'dbt', aliases: ['data build tool'], category: 'tool' },
  { canonical: 'Snowflake', aliases: [], category: 'platform' },
  { canonical: 'BigQuery', aliases: ['Google BigQuery'], category: 'platform' },
  { canonical: 'Databricks', aliases: [], category: 'platform' },
  { canonical: 'Pandas', aliases: [], category: 'framework' },
  { canonical: 'PyTorch', aliases: [], category: 'framework' },
  { canonical: 'TensorFlow', aliases: ['TF'], category: 'framework' },
  { canonical: 'scikit-learn', aliases: ['sklearn'], category: 'framework' },

  // === Cloud ===
  { canonical: 'AWS', aliases: ['Amazon Web Services'], category: 'platform' },
  { canonical: 'GCP', aliases: ['Google Cloud Platform', 'Google Cloud'], category: 'platform' },
  { canonical: 'Azure', aliases: ['Microsoft Azure'], category: 'platform' },
  { canonical: 'Kubernetes', aliases: ['K8s'], category: 'tool' },
  { canonical: 'Docker', aliases: [], category: 'tool' },
  { canonical: 'Terraform', aliases: [], category: 'tool' },

  // === Soft skills (used carefully — these embed weakly) ===
  { canonical: 'Cross-functional Collaboration', aliases: ['XFN', 'Stakeholder Management'], category: 'soft' },
  { canonical: 'Strategic Thinking', aliases: ['Strategy'], category: 'soft' },
  { canonical: 'Communication', aliases: ['Written Communication', 'Verbal Communication'], category: 'soft' },
  { canonical: 'Leadership', aliases: ['People Management', 'Team Leadership'], category: 'soft' },

  // === Domain ===
  { canonical: 'B2B SaaS', aliases: ['SaaS'], category: 'domain' },
  { canonical: 'B2C', aliases: ['Direct-to-Consumer', 'D2C', 'DTC'], category: 'domain' },
  { canonical: 'Fintech', aliases: ['Financial Technology'], category: 'domain' },
  { canonical: 'Healthcare', aliases: ['HealthTech'], category: 'domain' },
  { canonical: 'E-commerce', aliases: ['Ecommerce'], category: 'domain' },
  { canonical: 'Marketplace', aliases: ['Two-sided Marketplace'], category: 'domain' },
  { canonical: 'Subscription Business', aliases: ['Subscription Model'], category: 'domain' },
];

export async function seedSkillTaxonomy(db: Database): Promise<void> {
  if (SEED_SKILLS.length === 0) return;
  await db.insert(skillTaxonomy).values(
    SEED_SKILLS.map(s => ({
      canonical: s.canonical,
      aliases: s.aliases,
      category: s.category,
    }))
  ).onConflictDoNothing();
}
