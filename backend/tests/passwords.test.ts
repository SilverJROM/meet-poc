import { describe, expect, it } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { verifyPassword } from '../src/lib/passwords.js';
import { createTestDb, initialPassword } from './helpers.js';

describe('password storage', () => {
  it('S1.5 stores a scrypt hash instead of plaintext', () => {
    const db = createTestDb();
    seedUser(db);
    const row = db
      .prepare('SELECT password_hash FROM users WHERE email = ?')
      .get('jrom@silverjrom.app') as { password_hash: string };

    expect(row.password_hash).not.toBe(initialPassword());
    expect(row.password_hash).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
    expect(verifyPassword(initialPassword(), row.password_hash)).toBe(true);
  });
});
