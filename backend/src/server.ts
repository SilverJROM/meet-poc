import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { countUsers, getDb, getRepoRoot, runMigrations } from './db.js';
import { authRouter } from './modules/auth/index.js';
import { roomsRouter } from './modules/rooms/index.js';
import { attachSignaling } from './modules/signaling/index.js';
import { migrateFromJson } from '../scripts/migrate-from-json.js';

export function createApp(database = getDb()): express.Express {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', authRouter(database));
  app.use('/api', roomsRouter(database));
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
  const db = getDb();
  const app = createApp(db);
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
