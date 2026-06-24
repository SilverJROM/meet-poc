import type { NextFunction, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';
import { parseCookies } from '../../lib/cookies.js';
import { getSessionUser, type SessionUser } from './sessions.js';

export type AuthenticatedRequest = Request & {
  user: SessionUser;
  sessionToken: string;
};

export function requireAuth(database: Database.Database = getDb()) {
  return (req: Request, res: Response, next: NextFunction) => {
    const cookies = parseCookies(req.headers.cookie);
    const user = getSessionUser(cookies.session, database);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    Object.assign(req, { user, sessionToken: cookies.session });
    return next();
  };
}

export function requireAdmin(database: Database.Database = getDb()) {
  const auth = requireAuth(database);
  return (req: Request, res: Response, next: NextFunction) => {
    auth(req, res, () => {
      const { user } = req as AuthenticatedRequest;
      if (!user.isAdmin) return res.status(403).json({ error: 'forbidden' });
      return next();
    });
  };
}

export function requireSuperuser(database: Database.Database = getDb()) {
  const auth = requireAuth(database);
  return (req: Request, res: Response, next: NextFunction) => {
    auth(req, res, () => {
      const { user } = req as AuthenticatedRequest;
      if (!user.isSuperuser) return res.status(403).json({ error: 'forbidden' });
      return next();
    });
  };
}
