import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';
import { requireAdmin, requireSuperuser, type AuthenticatedRequest } from '../auth/middleware.js';
import { hashPassword } from '../../lib/passwords.js';
import { getDiagnosticsGloballyEnabled, setDiagnosticsGloballyEnabled } from '../app-settings/store.js';
import { changeUserEmail } from '../account/store.js';
import { isSuperuserEmail, isSuperuserTargetBlocked } from './guards.js';
import { deleteUser, resetUserPassword, setUserAdmin, setUserDisplayName } from './store.js';

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

function normalizeEmailParam(value: string | string[]): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return decodeURIComponent(String(raw || '').trim());
}

export function adminRouter(database: Database.Database = getDb()): Router {
  const router = Router();
  const admin = requireAdmin(database);
  const superuser = requireSuperuser(database);

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
        protected: isSuperuserEmail(u.email, database),
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

  router.delete('/admin/users/:email', admin, (req, res) => {
    const targetEmail = normalizeEmailParam(req.params.email);
    if (isSuperuserTargetBlocked(targetEmail, database)) return res.status(403).json({ error: 'forbidden' });

    const existing = database.prepare('SELECT 1 FROM users WHERE email = ?').get(targetEmail);
    if (!existing) return res.status(404).json({ error: 'user not found' });

    deleteUser(targetEmail, database);
    console.log(`[admin] user deleted: "${targetEmail}"`);
    return res.json({ ok: true });
  });

  router.patch('/admin/users/:email/role', admin, (req, res) => {
    const targetEmail = normalizeEmailParam(req.params.email);
    if (isSuperuserTargetBlocked(targetEmail, database)) return res.status(403).json({ error: 'forbidden' });

    if (typeof req.body?.isAdmin !== 'boolean') return res.status(400).json({ error: 'isAdmin boolean required' });

    const existing = database.prepare('SELECT 1 FROM users WHERE email = ?').get(targetEmail);
    if (!existing) return res.status(404).json({ error: 'user not found' });

    setUserAdmin(targetEmail, req.body.isAdmin, database);
    console.log(`[admin] user role updated: "${targetEmail}" admin=${req.body.isAdmin}`);
    return res.json({ ok: true, isAdmin: req.body.isAdmin });
  });

  router.patch('/admin/users/:email', superuser, (req, res) => {
    const authed = req as AuthenticatedRequest;
    const targetEmail = normalizeEmailParam(req.params.email);
    if (isSuperuserTargetBlocked(targetEmail, database, { callerEmail: authed.user.email, allowSelf: true })) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const displayName = String(req.body?.displayName ?? '').trim();
    if (!displayName) return res.status(400).json({ error: 'displayName required' });
    if (displayName.length > MAX_DISPLAY_NAME) return res.status(400).json({ error: 'display name too long' });

    const existing = database.prepare('SELECT 1 FROM users WHERE email = ?').get(targetEmail);
    if (!existing) return res.status(404).json({ error: 'user not found' });

    setUserDisplayName(targetEmail, displayName, database);
    console.log(`[admin] display name updated: "${targetEmail}" -> "${displayName}"`);
    return res.json({ ok: true, displayName });
  });

  router.patch('/admin/users/:email/email', superuser, (req, res) => {
    const authed = req as AuthenticatedRequest;
    const targetEmail = normalizeEmailParam(req.params.email);
    if (isSuperuserTargetBlocked(targetEmail, database, { callerEmail: authed.user.email, allowSelf: true })) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const newEmail = String(req.body?.newEmail ?? '').trim();
    if (!newEmail || !EMAIL_RE.test(newEmail) || newEmail.length > 200) {
      return res.status(400).json({ error: 'invalid email' });
    }

    const result = changeUserEmail(targetEmail, newEmail, database);
    if (!result.ok) return res.status(result.status).json({ error: result.error });

    console.log(`[admin] email updated: "${targetEmail}" -> "${newEmail}"`);
    return res.json({ ok: true, email: newEmail });
  });

  router.post('/admin/users/:email/reset-password', superuser, (req, res) => {
    const authed = req as AuthenticatedRequest;
    const targetEmail = normalizeEmailParam(req.params.email);
    if (isSuperuserTargetBlocked(targetEmail, database, { callerEmail: authed.user.email, allowSelf: true })) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const password = String(req.body?.newPassword ?? '');
    if (password.length < MIN_PASSWORD) return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD} characters` });
    if (password.length > MAX_PASSWORD) return res.status(400).json({ error: 'password too long' });

    const existing = database.prepare('SELECT 1 FROM users WHERE email = ?').get(targetEmail);
    if (!existing) return res.status(404).json({ error: 'user not found' });

    resetUserPassword(targetEmail, hashPassword(password), database);
    console.log(`[admin] password reset: "${targetEmail}"`);
    return res.json({ ok: true });
  });

  // R5 — global diagnostics kill-switch (admin only). Scoped to the single
  // diagnostics flag — NOT a general settings editor. Reuses requireAdmin; no
  // new auth/RBAC boundary.
  router.get('/admin/settings/diagnostics', admin, (_req, res) => {
    return res.json({ enabled: getDiagnosticsGloballyEnabled(database) });
  });

  router.put('/admin/settings/diagnostics', admin, (req, res) => {
    const enabled = req.body?.enabled === true || req.body?.enabled === 'true' || req.body?.enabled === 1;
    setDiagnosticsGloballyEnabled(enabled, database);
    console.log(`[admin] diagnostics globally ${enabled ? 'ENABLED' : 'DISABLED'}`);
    return res.json({ enabled });
  });

  return router;
}