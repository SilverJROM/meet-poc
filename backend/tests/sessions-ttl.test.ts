import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server.js';
import { seedUser } from '../scripts/seed.js';
import { createTestDb } from './helpers.js';

describe('session ttl', () => {
  it('S1.6 rejects and deletes expired sessions', async () => {
    const db = createTestDb();
    seedUser(db);
    db.prepare('INSERT INTO sessions (token, email, expires_at) VALUES (?, ?, ?)').run(
      'expired-token',
      'jrom@silverjrom.app',
      Date.now() - 1000,
    );

    await request(createApp(db)).get('/api/me').set('Cookie', 'session=expired-token').expect(200, {
      user: null,
      diagnosticsGloballyEnabled: true,
    });
    const row = db.prepare('SELECT token FROM sessions WHERE token = ?').get('expired-token');
    expect(row).toBeUndefined();
  });
});
