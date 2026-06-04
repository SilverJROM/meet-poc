import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/server.js';
import { seedUser } from '../scripts/seed.js';
import { createTestDb, initialPassword } from './helpers.js';

describe('auth login', () => {
  it('S1.1 returns 200 and sets the session cookie for valid credentials', async () => {
    const db = createTestDb();
    seedUser(db);

    const res = await request(createApp(db))
      .post('/api/login')
      .set('x-forwarded-proto', 'https')
      .send({ email: 'jrom@silverjrom.app', password: initialPassword() })
      .expect(200);

    expect(res.body).toEqual({ email: 'jrom@silverjrom.app', displayName: 'jrom', isAdmin: false });
    const cookie = res.headers['set-cookie']?.[0] || '';
    expect(cookie).toContain('session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
  });

  it('S1.2 returns 401, no cookie, and logs failed password attempts', async () => {
    const db = createTestDb();
    seedUser(db);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const res = await request(createApp(db))
      .post('/api/login')
      .send({ email: 'jrom@silverjrom.app', password: 'not-the-password' })
      .expect(401);

    expect(res.body).toEqual({ error: 'invalid credentials' });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[login] FAIL'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('wrong password for "jrom@silverjrom.app"'));
    logSpy.mockRestore();
  });
});
