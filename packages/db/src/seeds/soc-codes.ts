/**
 * Seed BLS Standard Occupational Classification (SOC) codes.
 * v1 starter set focused on marketing/PM/pricing/SWE.
 * Source: https://www.bls.gov/soc/2018/major_groups.htm
 */
import type { Database } from '../index.js';
import { socCodes } from '../schema/v2.js';

interface SocSeed {
  code: string;
  title: string;
  majorGroup: string;
  minorGroup: string;
  isStem?: boolean;
  description?: string;
  cipCodes?: string[];
}

const SEED_SOC: SocSeed[] = [
  { code: '11-2011', title: 'Advertising and Promotions Managers', majorGroup: '11-0000', minorGroup: '11-2000' },
  { code: '11-2021', title: 'Marketing Managers', majorGroup: '11-0000', minorGroup: '11-2000' },
  { code: '11-2032', title: 'Public Relations Managers', majorGroup: '11-0000', minorGroup: '11-2000' },
  { code: '11-1021', title: 'General and Operations Managers', majorGroup: '11-0000', minorGroup: '11-1000' },
  { code: '11-3021', title: 'Computer and Information Systems Managers', majorGroup: '11-0000', minorGroup: '11-3000', isStem: true },
  { code: '13-1161', title: 'Market Research Analysts and Marketing Specialists', majorGroup: '13-0000', minorGroup: '13-1100' },
  { code: '13-1111', title: 'Management Analysts', majorGroup: '13-0000', minorGroup: '13-1100' },
  { code: '13-2099', title: 'Financial Specialists, All Other', majorGroup: '13-0000', minorGroup: '13-2000' },
  { code: '15-1252', title: 'Software Developers', majorGroup: '15-0000', minorGroup: '15-1250', isStem: true, cipCodes: ['11.0701'] },
  { code: '15-1254', title: 'Web Developers', majorGroup: '15-0000', minorGroup: '15-1250', isStem: true },
  { code: '15-1212', title: 'Information Security Analysts', majorGroup: '15-0000', minorGroup: '15-1210', isStem: true },
  { code: '15-2051', title: 'Data Scientists', majorGroup: '15-0000', minorGroup: '15-2050', isStem: true },
];

export async function seedSocCodes(db: Database): Promise<void> {
  if (SEED_SOC.length === 0) return;
  await db.insert(socCodes).values(
    SEED_SOC.map(s => ({
      code: s.code,
      title: s.title,
      majorGroup: s.majorGroup,
      minorGroup: s.minorGroup,
      isStem: s.isStem ?? false,
      description: s.description,
      cipCodes: s.cipCodes,
    }))
  ).onConflictDoNothing();
}
