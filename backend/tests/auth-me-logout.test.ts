import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server.js';
import { seedUser } from '../scripts/seed.js';
import { createTestDb, initialPassword } from './helpers.js';

describe('/api/me and logout', () => {
  it('S1.3 returns null without a cookie and user with a valid cookie', async () => {
    const db = createTestDb();
    seedUser(db);
    const app = createApp(db);

    await request(app).get('/api/me').expect(200, { user: null });
    const login = await request(app)
      .post('/api/login')
      .send({ email: 'jrom@silverjrom.app', password: initialPassword() })
      .expect(200);
    const cookie = login.headers['set-cookie'];

    await request(app).get('/api/me').set('Cookie', cookie).expect(200, {
      user: { email: 'jrom@silverjrom.app' },
    });
  });

  it('S1.4 logout invalidates the session', async () => {
    const db = createTestDb();
    seedUser(db);
    const app = createApp(db);
    const login = await request(app)
      .post('/api/login')
      .send({ email: 'jrom@silverjrom.app', password: initialPassword() })
      .expect(200);
    const cookie = login.headers['set-cookie'];

    await request(app).post('/api/logout').set('Cookie', cookie).expect(200, { ok: true });
    await request(app).get('/api/me').set('Cookie', cookie).expect(200, { user: null });
  });
});
