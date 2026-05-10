/**
 * Seed role families — used by the titleAlignment subscore.
 *
 * Each family has aliases and links to SOC codes. Role families
 * are grouped by parent (e.g. "Marketing" parent → "Growth Marketing"
 * and "Performance Marketing" children).
 */
import type { Database } from '../index.js';
import { roleFamilies } from '../schema/v2.js';

interface RoleFamilySeed {
  canonical: string;
  aliases: string[];
  socCodes: string[];
  description?: string;
}

const SEED_FAMILIES: RoleFamilySeed[] = [
  // === Marketing — Adhithya's primary targeting ===
  {
    canonical: 'Marketing Manager',
    aliases: ['Marketing Manager', 'Marketing Lead', 'Senior Marketing Manager'],
    socCodes: ['11-2021'],
  },
  {
    canonical: 'Growth Marketing',
    aliases: ['Growth Marketing', 'Growth Manager', 'Growth Lead', 'Head of Growth', 'Growth Marketer'],
    socCodes: ['11-2021', '13-1161'],
  },
  {
    canonical: 'Performance Marketing',
    aliases: ['Performance Marketing', 'Paid Acquisition', 'Acquisition Marketing', 'Paid Marketing'],
    socCodes: ['11-2021'],
  },
  {
    canonical: 'Paid Media',
    aliases: ['Paid Media', 'Media Buyer', 'Media Planner', 'Paid Search', 'Paid Social', 'SEM', 'Programmatic'],
    socCodes: ['11-2021'],
  },
  {
    canonical: 'Product Marketing',
    aliases: ['Product Marketing', 'PMM', 'Product Marketing Manager'],
    socCodes: ['11-2021'],
  },
  {
    canonical: 'Lifecycle Marketing',
    aliases: ['Lifecycle Marketing', 'CRM Marketing', 'Email Marketing', 'Retention Marketing'],
    socCodes: ['11-2021'],
  },
  {
    canonical: 'Brand Marketing',
    aliases: ['Brand Marketing', 'Brand Manager', 'Brand Strategist'],
    socCodes: ['11-2021'],
  },
  {
    canonical: 'Content Marketing',
    aliases: ['Content Marketing', 'Content Manager', 'Content Strategist'],
    socCodes: ['11-2021', '27-3043'],
  },
  {
    canonical: 'SEO',
    aliases: ['SEO', 'Search Engine Optimization', 'Organic Marketing'],
    socCodes: ['11-2021'],
  },
  {
    canonical: 'Marketing Analytics',
    aliases: ['Marketing Analytics', 'Marketing Analyst', 'Marketing Operations', 'MarOps'],
    socCodes: ['13-1161'],
  },

  // === Product Management ===
  {
    canonical: 'Product Manager',
    aliases: ['Product Manager', 'PM', 'Senior Product Manager', 'Group Product Manager'],
    socCodes: ['11-3021', '11-1021'],
  },
  {
    canonical: 'Associate Product Manager',
    aliases: ['Associate Product Manager', 'APM', 'Product Manager I'],
    socCodes: ['11-3021'],
  },
  {
    canonical: 'Technical Product Manager',
    aliases: ['Technical Product Manager', 'TPM', 'Technical PM'],
    socCodes: ['11-3021'],
  },
  {
    canonical: 'Product Analyst',
    aliases: ['Product Analyst', 'Product Operations Analyst'],
    socCodes: ['13-1161', '13-1111'],
  },

  // === Pricing ===
  {
    canonical: 'Pricing Manager',
    aliases: ['Pricing Manager', 'Pricing Strategy', 'Revenue Management', 'Monetization'],
    socCodes: ['13-2099', '13-1111'],
  },
  {
    canonical: 'Pricing Analyst',
    aliases: ['Pricing Analyst', 'Revenue Analyst'],
    socCodes: ['13-2051', '13-1161'],
  },

  // === Software (broader audience) ===
  {
    canonical: 'Software Engineer',
    aliases: ['Software Engineer', 'SWE', 'SDE', 'Software Developer', 'Backend Engineer', 'Full-Stack Engineer'],
    socCodes: ['15-1252'],
  },
  {
    canonical: 'Frontend Engineer',
    aliases: ['Frontend Engineer', 'Front-End Engineer', 'UI Engineer', 'React Engineer'],
    socCodes: ['15-1252', '15-1254'],
  },
  {
    canonical: 'Data Scientist',
    aliases: ['Data Scientist', 'DS', 'Applied Scientist'],
    socCodes: ['15-2051'],
  },
  {
    canonical: 'Data Engineer',
    aliases: ['Data Engineer', 'Analytics Engineer'],
    socCodes: ['15-1252', '15-2051'],
  },
  {
    canonical: 'ML Engineer',
    aliases: ['Machine Learning Engineer', 'ML Engineer', 'MLE', 'AI Engineer'],
    socCodes: ['15-2051', '15-1252'],
  },
];

export async function seedRoleFamilies(db: Database): Promise<void> {
  if (SEED_FAMILIES.length === 0) return;
  await db.insert(roleFamilies).values(
    SEED_FAMILIES.map(f => ({
      canonical: f.canonical,
      aliases: f.aliases,
      socCodes: f.socCodes,
      description: f.description ?? null,
    }))
  ).onConflictDoNothing();
}
