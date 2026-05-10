/**
 * Schema barrel — combines v1 (existing tables) and v2 (additive extensions + new tables).
 *
 * v1 tables stay unchanged. v2 adds:
 *   - new schemas: visa, ml, ops, audit
 *   - new columns on existing tables (all nullable)
 *   - new tables in the new schemas
 *
 * See docs/03_architecture.md §4 for the full domain map.
 */

export * from './v1.js';
export * from './v2.js';
export * from './v2-capability.js';
