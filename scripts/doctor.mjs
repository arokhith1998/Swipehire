#!/usr/bin/env node
/**
 * SwipeHire doctor — validates that a fresh checkout can run.
 * Adapted in spirit from career-ops/doctor.mjs.
 *
 * Usage:
 *   node scripts/doctor.mjs
 *
 * Exit code: 0 = healthy, 1 = something is missing or misconfigured.
 */

import { readFile, stat } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, warn = 0, fail = 0;

function ok(msg) { console.log(`  ✅ ${msg}`); pass++; }
function warning(msg) { console.log(`  ⚠️  ${msg}`); warn++; }
function bad(msg) { console.log(`  ❌ ${msg}`); fail++; }

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function checkNode() {
  console.log('\n🟢 Node');
  const v = process.versions.node;
  const major = parseInt(v.split('.')[0], 10);
  if (major >= 22) ok(`node ${v}`);
  else bad(`node ${v} — need ≥ 22`);
}

async function checkPnpm() {
  console.log('\n🟢 pnpm');
  try {
    const v = execSync('pnpm --version', { encoding: 'utf8' }).trim();
    const major = parseInt(v.split('.')[0], 10);
    if (major >= 9) ok(`pnpm ${v}`);
    else warning(`pnpm ${v} — recommend ≥ 9`);
  } catch {
    bad('pnpm not found — install with: npm i -g pnpm');
  }
}

async function checkDocker() {
  console.log('\n🟢 Docker');
  try {
    execSync('docker --version', { stdio: 'pipe' });
    ok('docker installed');
  } catch {
    warning('docker not found — needed for postgres+pgvector, redis, ml-sidecar');
  }
}

async function checkPython() {
  console.log('\n🟢 Python (for ml-sidecar dev)');
  try {
    const v = execSync('python3 --version', { encoding: 'utf8' }).trim();
    if (v.includes('3.12') || v.includes('3.13')) ok(v);
    else warning(`${v} — recommend 3.12`);
  } catch {
    warning('python3 not found — needed only for ml-sidecar dev outside docker');
  }
}

async function checkEnv() {
  console.log('\n🟢 Environment');
  const envPath = path.join(ROOT, '.env');
  if (!(await exists(envPath))) {
    bad('.env missing — copy from .env.example and fill in values');
    return;
  }
  ok('.env present');

  const env = await readFile(envPath, 'utf8');
  const required = ['DATABASE_URL', 'SESSION_SECRET'];
  const recommended = ['REDIS_URL', 'ML_SIDECAR_URL', 'OPENAI_API_KEY'];
  for (const k of required) {
    if (env.includes(`${k}=`) && !env.includes(`${k}=\n`) && !env.match(new RegExp(`^${k}=$`, 'm'))) {
      ok(`${k} set`);
    } else {
      bad(`${k} missing or empty in .env`);
    }
  }
  for (const k of recommended) {
    if (env.includes(`${k}=`) && !env.match(new RegExp(`^${k}=$`, 'm'))) ok(`${k} set`);
    else warning(`${k} not set (recommended)`);
  }
}

async function checkStructure() {
  console.log('\n🟢 Repository structure');
  const expected = [
    'apps/web', 'apps/api', 'apps/ml-sidecar', 'apps/worker',
    'packages/shared', 'packages/db',
    'docs/01_strategy.md', 'docs/02_algorithm_v2.md', 'docs/03_architecture.md',
    'package.json', 'pnpm-workspace.yaml', 'docker-compose.yml',
  ];
  for (const p of expected) {
    if (await exists(path.join(ROOT, p))) ok(p);
    else bad(`missing: ${p}`);
  }
}

async function summarize() {
  console.log('\n──────────────────────────────────────');
  console.log(`  ✅ ${pass} passed   ⚠️  ${warn} warnings   ❌ ${fail} failed`);
  if (fail > 0) {
    console.log('\nDoctor found issues. Fix the ❌ items before running pnpm dev.');
    process.exit(1);
  }
  if (warn > 0) {
    console.log('\nDoctor passed with warnings. You can proceed but some features will be limited.');
  } else {
    console.log('\nAll checks passed. Run: pnpm dev');
  }
  process.exit(0);
}

console.log('🩺 SwipeHire doctor — checking your local setup…');
await checkNode();
await checkPnpm();
await checkDocker();
await checkPython();
await checkEnv();
await checkStructure();
await summarize();
