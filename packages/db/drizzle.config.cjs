const { defineConfig } = require('drizzle-kit');
const { readFileSync } = require('node:fs');
const path = require('node:path');

// Load .env from monorepo root manually
try {
  const envContent = readFileSync(path.resolve(__dirname, '../../.env'), 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  }
} catch (err) {
  console.warn('Could not load .env from root:', err.message);
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for Drizzle');
}

module.exports = defineConfig({
  // Point drizzle-kit at each schema file directly. Bypasses the index.ts
  // barrel (which uses ESM-style './v1.js' imports that fail under
  // drizzle-kit's CJS loader).
  schema: [
    './src/schema/v1.ts',
    './src/schema/v2.ts',
    './src/schema/v2-capability.ts',
  ],
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL },
  // Without this, drizzle-kit only introspects 'public' and silently skips
  // tables defined in non-public schemas (visa, ml, ops, audit).
  // 'app' is intentionally excluded — it exists in the DB (init SQL) but no
  // Drizzle schema declares tables there yet; including it would make drizzle-kit
  // try to DROP SCHEMA "app".
  schemaFilter: ['public', 'visa', 'ml', 'ops', 'audit'],
  verbose: true,
  strict: true,
});
