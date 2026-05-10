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
