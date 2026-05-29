import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';
import { requireAuth, type AuthenticatedRequest } from '../auth/middleware.js';
import { hashPassword, verifyPassword } from '../../lib/passwords.js';
import { changeUserEmail } from './store.js';

const MAX_DISPLAY_NAME = 64;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function accountRouter(database: Database.Database = getDb()): Router {
  const router = Router();
  const auth = requireAuth(database);

  // R1 — set the username/display name used on calls.
  router.put('/account/display-name', auth, (req, res) => {
    const authed = req as AuthenticatedRequest;
    const name = String(req.body?.displayName ?? '').trim();
    if (!name) return res.status(400).json({ error: 'display name required' });
    if (name.length > MAX_DISPLAY_NAME) return res.status(400).json({ error: 'display name too long' });
    database
      .prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE email = ?')
      .run(name, Date.now(), authed.user.email);
    return res.json({ displayName: name });
  });

  // R2 — change password (verify current, then set new).
  router.put('/account/password', auth, (req, res) => {
    const authed = req as AuthenticatedRequest;
    const currentPassword = String(req.body?.currentPassword ?? '');
    const newPassword = String(req.body?.newPassword ?? '');
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'missing fields' });
    if (newPassword.length < MIN_PASSWORD) return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD} characters` });
    if (newPassword.length > MAX_PASSWORD) return res.status(400).json({ error: 'password too long' });
    const row = database
      .prepare('SELECT password_hash FROM users WHERE email = ?')
      .get(authed.user.email) as { password_hash: string } | undefined;
    if (!row || !verifyPassword(currentPassword, row.password_hash)) {
      return res.status(401).json({ error: 'current password incorrect' });
    }
    database
      .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE email = ?')
      .run(hashPassword(newPassword), Date.now(), authed.user.email);
    console.log(`[account] password changed for "${authed.user.email}"`);
    return res.json({ ok: true });
  });

  // R3 — change email, cascading across all tables (verify password first).
  router.put('/account/email', auth, (req, res) => {
    const authed = req as AuthenticatedRequest;
    const newEmail = String(req.body?.newEmail ?? '').trim();
    const password = String(req.body?.password ?? '');
    const oldEmail = authed.user.email;
    if (!newEmail || !password) return res.status(400).json({ error: 'missing fields' });
    if (newEmail.length > 200 || !EMAIL_RE.test(newEmail)) return res.status(400).json({ error: 'invalid email' });
    if (newEmail.toLowerCase() === oldEmail.toLowerCase()) return res.status(400).json({ error: 'email unchanged' });
    const row = database
      .prepare('SELECT password_hash FROM users WHERE email = ?')
      .get(oldEmail) as { password_hash: string } | undefined;
    if (!row || !verifyPassword(password, row.password_hash)) {
      return res.status(401).json({ error: 'password incorrect' });
    }
    const result = changeUserEmail(oldEmail, newEmail, database);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    console.log(`[account] email changed ${oldEmail} -> ${newEmail}`);
    return res.json({ email: newEmail });
  });

  // R4 — Telegram link status.
  router.get('/account/telegram', auth, (req, res) => {
    const authed = req as AuthenticatedRequest;
    const link = database
      .prepare('SELECT tg_user_id, tg_username, tg_first_name FROM telegram_links WHERE email = ?')
      .get(authed.user.email) as { tg_user_id: number; tg_username: string | null; tg_first_name: string | null } | undefined;
    if (!link) return res.json({ linked: false });
    return res.json({ linked: true, username: link.tg_username, firstName: link.tg_first_name });
  });

  // R4 — unlink Telegram.
  router.delete('/account/telegram', auth, (req, res) => {
    const authed = req as AuthenticatedRequest;
    const result = database.prepare('DELETE FROM telegram_links WHERE email = ?').run(authed.user.email);
    console.log(`[account] telegram unlinked for "${authed.user.email}" (${result.changes} link(s))`);
    return res.json({ ok: true, removed: result.changes });
  });

  return router;
}
