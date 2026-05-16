/**
 * Entry point — delegates to the v2 createApp() in ./app.ts.
 *
 * The original v1 entry that lived here imported legacy services
 * (./routes, ./vite, ./services/jobScheduler) which still use the
 * pre-monorepo `@shared/schema` alias. They are excluded from typecheck
 * (see tsconfig.json) and will be migrated incrementally per
 * docs/04_scaffold_handoff.md.
 */
import 'dotenv/config';

// MUST run before any module that imports playwright (livenessChecker,
// greenhouseAdapter, pdf renderer). Playwright caches the browser-search
// root at module-load time; if PLAYWRIGHT_BROWSERS_PATH isn't set then,
// it locks in the default ~/.cache/ms-playwright (= /root/.cache on Railway,
// which isn't preserved by nixpacks). Setting it here means every
// `import 'playwright'` downstream sees the right path.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/app/.cache/ms-playwright';
}

import { createApp } from './app.js';
import { pino } from 'pino';

const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV === 'production'
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true } },
});

const port = parseInt(process.env.PORT ?? '5000', 10);
createApp().listen(port, () => log.info(`✅ SwipeHire API listening on :${port}`));
