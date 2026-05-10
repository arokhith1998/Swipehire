/**
 * Seed entry — runs all seeders in dependency order.
 * Idempotent: safe to re-run; uses INSERT ... ON CONFLICT DO NOTHING.
 */
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load workspace-root .env regardless of pnpm's cwd.
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, '../../../.env') });

const { db } = await import('./index.js');
import { seedSocCodes } from './seeds/soc-codes.js';
import { seedRoleFamilies } from './seeds/role-families.js';
import { seedSkillTaxonomy } from './seeds/skill-taxonomy.js';
import { seedDemoJobs } from './seeds/demo-jobs.js';

async function main() {
  console.log('🌱 Seeding SwipeHire database...');

  console.log('  → SOC codes (BLS reference)');
  await seedSocCodes(db);

  console.log('  → Role families');
  await seedRoleFamilies(db);

  console.log('  → Skill taxonomy (canonical skills, no embeddings yet — backfilled by ml-sidecar)');
  await seedSkillTaxonomy(db);

  console.log('  → Demo jobs for beta');
  const inserted = await seedDemoJobs(db);
  console.log(`     inserted ${inserted} new demo job(s)`);

  console.log('✅ Done. Skill embeddings will be backfilled the first time the ml-sidecar starts.');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
