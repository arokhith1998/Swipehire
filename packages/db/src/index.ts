/**
 * @swipehire/db — single import surface for the database layer.
 *
 * Usage:
 *   import { db, schema } from '@swipehire/db';
 *   const users = await db.select().from(schema.users);
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle(pool, { schema, logger: process.env.DB_LOG === 'true' });
export { schema };
export * from './schema/index.js';
export type Database = typeof db;
