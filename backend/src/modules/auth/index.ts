import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';
import { parseCookies, serializeSessionCookie } from '../../lib/cookies.js';
import { verifyPassword } from '../../lib/passwords.js';
import { SESSION_TTL_MS, createSession, destroySession, getSessionUser } from './sessions.js';

type UserRow = {
  email: string;
  password_hash: string;
};

function requestIp(req: import('express').Request): string | string[] | undefined {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress;
}

export function authRouter(database: Database.Database = getDb()): Router {
  const router = Router();

  router.post('/login', (req, res) => {
    const { email, password } = req.body || {};
    const ip = requestIp(req);
    if (!email || !password) {
      console.log(`[login] BAD-REQ from ${ip}: missing fields (email=${!!email}, password=${!!password})`);
      return res.status(400).json({ error: 'missing fields' });
    }

    const user = database
      .prepare('SELECT email, password_hash FROM users WHERE email = ?')
      .get(String(email)) as UserRow | undefined;

    if (!user) {
      console.log(`[login] FAIL from ${ip}: unknown email "${email}"`);
      return res.status(401).json({ error: 'invalid credentials' });
    }

    if (!verifyPassword(String(password), user.password_hash)) {
      console.log(`[login] FAIL from ${ip}: wrong password for "${email}" (pw length=${String(password).length})`);
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const token = createSession(user.email, database);
    res.setHeader('Set-Cookie', serializeSessionCookie(req, token, Math.floor(SESSION_TTL_MS / 1000)));
    console.log(`[login] OK from ${ip}: "${user.email}"`);
    return res.json({ email: user.email });
  });

  router.post('/logout', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    destroySession(cookies.session, database);
    res.setHeader('Set-Cookie', serializeSessionCookie(req, '', 0));
    return res.json({ ok: true });
  });

  router.get('/me', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const user = getSessionUser(cookies.session, database);
    if (!user) return res.json({ user: null });
    return res.json({ user: { email: user.email } });
  });

  return router;
}
