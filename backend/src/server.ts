import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { countUsers, getDb, getRepoRoot, runMigrations } from './db.js';
import { authRouter } from './modules/auth/index.js';
import { ensureRecordingsDir, recordingRouter } from './modules/recording/index.js';
import { roomsRouter } from './modules/rooms/index.js';
import { sessionsRouter } from './modules/sessions/index.js';
import { attachSignaling } from './modules/signaling/index.js';
import { iceConfigRouter } from './modules/ice-config/index.js';
import { realtimeSfuRouter } from './modules/realtime-sfu/index.js';
import { LlmService, llmRouter, logBootAvailability } from './modules/llm/index.js';
import { questionsRouter } from './modules/questions/index.js';
import { telegramRouter } from './modules/telegram/index.js';
import { accountRouter } from './modules/account/index.js';
import { adminRouter } from './modules/admin/index.js';
import { backgroundsRouter } from './modules/backgrounds/index.js';
import { migrateFromJson } from '../scripts/migrate-from-json.js';

interface CreateAppOptions {
  llmService?: Pick<LlmService, 'availability'> & Partial<Pick<LlmService, 'get'>>;
}

export function createApp(database = getDb(), options: CreateAppOptions = {}): express.Express {
  const app = express();
  app.set('trust proxy', true);
  // Background uploads carry a (resized) image data URL — needs a larger body
  // limit than the global default. This path-scoped parser runs first; the
  // global 1mb parser then skips (req._body already set) for this route only.
  app.use('/api/account/backgrounds', express.json({ limit: '30mb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', authRouter(database));
  app.use('/api', iceConfigRouter());
  app.use('/api', realtimeSfuRouter());
  app.use('/api', roomsRouter(database));
  app.use('/api', sessionsRouter(database));
  app.use('/api', llmRouter(database, options.llmService));
  const analysisService =
    options.llmService && typeof options.llmService.get === 'function'
      ? (options.llmService as Pick<LlmService, 'get'>)
      : undefined;
  app.use('/api', questionsRouter(database, analysisService));
  app.use('/api', telegramRouter(database));
  app.use('/api', accountRouter(database));
  app.use('/api', adminRouter(database));
  app.use('/api', backgroundsRouter(database));
  app.use('/', recordingRouter(database));
  app.get('/health', (_req, res) => res.json({ ok: true }));
  return app;
}

export async function prepareDatabase(): Promise<void> {
  const db = getDb();
  runMigrations(db);
  const legacyJsonPath = path.join(getRepoRoot(), 'legacy-poc', 'data.json');
  if (countUsers(db) === 0 && fs.existsSync(legacyJsonPath)) {
    migrateFromJson({ jsonPath: legacyJsonPath, database: db });
  }
}

export async function startServer(): Promise<http.Server> {
  await prepareDatabase();
  ensureRecordingsDir();
  const db = getDb();
  const llmService = new LlmService();
  void logBootAvailability(llmService).catch((err) => console.error('[llm] availability check failed', err));
  const app = createApp(db, { llmService });
  const server = http.createServer(app);
  attachSignaling(server, db);

  const port = Number(process.env.PORT || 4720);
  server.listen(port, '0.0.0.0', () => {
    console.log(`meet-poc backend listening on http://0.0.0.0:${port}`);
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((err) => {
    console.error('[server] failed to start', err);
    process.exit(1);
  });
}
