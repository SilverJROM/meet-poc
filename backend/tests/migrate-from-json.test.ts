import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { migrateFromJson } from '../scripts/migrate-from-json.js';
import { createApp } from '../src/server.js';
import { createTestDb, initialPassword } from './helpers.js';

describe('legacy migration', () => {
  it('S1.7 imports legacy data.json users and preserves login compatibility', async () => {
    const db = createTestDb();
    const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meet-poc-legacy-json-'));
    const legacyJsonPath = path.join(legacyDir, 'data.json');
    fs.writeFileSync(
      legacyJsonPath,
      JSON.stringify({
        users: [
          {
            email: 'jrom@silverjrom.app',
            passwordHash:
              'd71496a3659b2adb7690a7aff9c75d2f:d54eaf03c1ad3bd78af85cfd2f036eac5d9d75f2f0280913cf93e12e4e7d47cd078815bdb46bc6092c77e17f1651e8a03ac63fa6248637e8a776be6489c2eda8',
            createdAt: 1779150913259,
            updatedAt: 1779151417827,
          },
        ],
        sessions: {},
      }),
    );
    migrateFromJson({ jsonPath: legacyJsonPath, database: db });
    fs.rmSync(legacyDir, { recursive: true, force: true });

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
