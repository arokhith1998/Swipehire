/**
 * @swipehire/applier-core
 *
 * Field-mapping and answer-generation logic shared between:
 *   - Server-side Playwright adapters (apps/api/src/applier/adapters/*)
 *   - Browser extension content scripts (apps/extension/src/adapters/*)
 *
 * This package is environment-agnostic — it knows nothing about Playwright
 * or DOM APIs. It exports the SELECTORS, the FIELD MAP, the answer-generation
 * helpers, and the per-ATS detection logic. The execution layer (Playwright
 * locators OR browser DOM querySelector) is supplied by the caller.
 *
 * Why: maintain selectors ONCE. Server and extension can never drift.
 */

export * from './types.js';
export * from './detect.js';
export * from './answers.js';
export { greenhouseSpec } from './adapters/greenhouse.js';
export { leverSpec } from './adapters/lever.js';
export { ashbySpec } from './adapters/ashby.js';
export { genericSpec } from './adapters/generic.js';
export { ALL_SPECS, getSpecForAts } from './registry.js';
