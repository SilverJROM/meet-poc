import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';
import { requireAdmin } from '../auth/middleware.js';
import { hashPassword } from '../../lib/passwords.js';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;
const MAX_DISPLAY_NAME = 64;

type AdminUserRow = {
  email: string;
  display_name: string | null;
  is_admin: number;
  created_at: number;
  tg_username: string | null;
};

export function adminRouter(database: Database.Database = getDb()): Router {
  const router = Router();
  const admin = requireAdmin(database);

  // R5 — list users (admin only).
  router.get('/admin/users', admin, (_req, res) => {
    const rows = database
      .prepare(
        `SELECT u.email, u.display_name, u.is_admin, u.created_at,
           (SELECT tg_username FROM telegram_links WHERE email = u.email ORDER BY linked_at DESC LIMIT 1) AS tg_username
         FROM users u
         ORDER BY u.created_at`,
      )
      .all() as AdminUserRow[];
    return res.json({
      users: rows.map((u) => ({
        email: u.email,
        displayName: u.display_name || u.email.split('@')[0] || u.email,
        isAdmin: u.is_admin === 1,
        createdAt: u.created_at,
        telegramUsername: u.tg_username,
      })),
    });
  });

  // R6 — create a new user (admin only).
  router.post('/admin/users', admin, (req, res) => {
    const email = String(req.body?.email ?? '').trim();
    const password = String(req.body?.password ?? '');
    const displayNameInput = String(req.body?.displayName ?? '').trim();
    const isAdmin = req.body?.isAdmin === true;

    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    if (email.length > 200 || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'invalid email' });
    if (password.length < MIN_PASSWORD) return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD} characters` });
    if (password.length > MAX_PASSWORD) return res.status(400).json({ error: 'password too long' });
    if (displayNameInput.length > MAX_DISPLAY_NAME) return res.status(400).json({ error: 'display name too long' });

    const existing = database.prepare('SELECT 1 FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'email already in use' });

    const now = Date.now();
    const displayName = displayNameInput || email.split('@')[0] || email;
    database
      .prepare('INSERT INTO users (email, password_hash, created_at, updated_at, display_name, is_admin) VALUES (?, ?, ?, ?, ?, ?)')
      .run(email, hashPassword(password), now, now, displayName, isAdmin ? 1 : 0);
    console.log(`[admin] user created: "${email}" (admin=${isAdmin})`);
    return res.json({ user: { email, displayName, isAdmin, createdAt: now } });
  });

  return router;
}
