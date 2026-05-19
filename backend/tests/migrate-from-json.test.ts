import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { migrateFromJson } from '../scripts/migrate-from-json.js';
import { createApp } from '../src/server.js';
import { getRepoRoot } from '../src/db.js';
import { createTestDb, initialPassword } from './helpers.js';

describe('legacy migration', () => {
  it('S1.7 imports legacy data.json users and preserves login compatibility', async () => {
    const db = createTestDb();
    migrateFromJson({ jsonPath: path.join(getRepoRoot(), 'legacy-poc', 'data.json'), database: db });

    const row = db
      .prepare('SELECT email, password_hash FROM users WHERE email = ?')
      .get('jrom@silverjrom.app') as { email: string; password_hash: string } | undefined;
    expect(row?.email).toBe('jrom@silverjrom.app');
    expect(row?.password_hash).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);

    await request(createApp(db))
      .post('/api/login')
      .send({ email: 'jrom@silverjrom.app', password: initialPassword() })
      .expect(200, { email: 'jrom@silverjrom.app' });
  });
});
