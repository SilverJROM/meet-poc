import crypto from 'node:crypto';
import { Router } from 'express';
import type { Request } from 'express';
import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';
import { parseCookies, serializeSessionCookie } from '../../lib/cookies.js';
import { verifyPassword } from '../../lib/passwords.js';
import { requireAuth, type AuthenticatedRequest } from '../auth/middleware.js';
import { SESSION_TTL_MS, createSession, destroyAllUserSessions } from '../auth/sessions.js';
import { generateChallengeToken, hashChallengeToken, buildNumberMatchSet } from '../../lib/tg-crypto.js';
import { verifyTurnstile } from '../../lib/turnstile.js';

const CHALLENGE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const ENROLLMENT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RATE_WINDOW_10MIN_MS = 10 * 60 * 1000;
const RATE_WINDOW_DAY_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_10MIN = 3;
const RATE_LIMIT_DAY = 10;

// --- Types ---

type ChallengeRow = {
  id: string;
  token_hash: string;
  email: string;
  email_hash: string;
  tg_user_id: number;
  display_number: number;
  button_numbers_json: string;
  expires_at: number;
  approved_at: number | null;
  denied_at: number | null;
  consumed_at: number | null;
  send_count: number;
  is_enrollment: number;
  created_at: number;
};

export type CallbackQuery = {
  id: string;
  from: { id: number };
  message?: { message_id: number; chat: { id: number } };
  data?: string;
};

// --- Eligibility (constant-time, anti-enumeration) ---

// Always performs all 3 DB reads + an async yield regardless of outcome.
// Ineligible and eligible paths return after the same amount of work.
// Never reveals which condition failed.
export async function resolveEligibility(
  email: string,
  database: Database.Database,
): Promise<{ eligible: false } | { eligible: true; tgUserId: number; emailHash: string }> {
  const emailNorm = email.toLowerCase().trim();
  const emailHash = crypto.createHash('sha256').update(emailNorm).digest('hex');

  const user = database
    .prepare('SELECT email FROM users WHERE email = ?')
    .get(emailNorm) as { email: string } | undefined;

  const settings = database
    .prepare('SELECT tg_status FROM user_passwordless_settings WHERE email = ?')
    .get(emailNorm) as { tg_status: string } | undefined;

  const link = database
    .prepare('SELECT tg_user_id FROM telegram_links WHERE email = ?')
    .get(emailNorm) as { tg_user_id: number } | undefined;

  // Constant-time async yield — identical delay for both paths
  await new Promise<void>((resolve) => setImmediate(resolve));

  if (!user || !settings || settings.tg_status !== 'active' || !link) {
    return { eligible: false };
  }

  return { eligible: true, tgUserId: link.tg_user_id, emailHash };
}

// --- Rate limiting ---

function rateWindow10min(now: number): string {
  return `10m:${Math.floor(now / RATE_WINDOW_10MIN_MS)}`;
}

function rateWindowDay(now: number): string {
  return `day:${Math.floor(now / RATE_WINDOW_DAY_MS)}`;
}

function checkRate(bucket: string, windowKey: string, limit: number, database: Database.Database): boolean {
  const row = database
    .prepare('SELECT count FROM tg_passwordless_rate WHERE bucket = ? AND window_key = ?')
    .get(bucket, windowKey) as { count: number } | undefined;
  return (row?.count ?? 0) < limit;
}

function incrementRate(bucket: string, windowKey: string, database: Database.Database): void {
  database
    .prepare(
      'INSERT INTO tg_passwordless_rate (bucket, window_key, count) VALUES (?, ?, 1)' +
        ' ON CONFLICT(bucket, window_key) DO UPDATE SET count = count + 1',
    )
    .run(bucket, windowKey);
}

// Check all 4 rate buckets first, then increment all if every check passes.
// This prevents partial increments when a later bucket would have blocked.
export function checkRateLimits(
  emailHash: string,
  ip: string,
  now: number,
  database: Database.Database,
): boolean {
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
  const userBucket = `user:${emailHash}`;
  const ipBucket = `ip:${ipHash}:${emailHash}`;
  const w10 = rateWindow10min(now);
  const wDay = rateWindowDay(now);

  if (!checkRate(userBucket, w10, RATE_LIMIT_10MIN, database)) return false;
  if (!checkRate(userBucket, wDay, RATE_LIMIT_DAY, database)) return false;
  if (!checkRate(ipBucket, w10, RATE_LIMIT_10MIN, database)) return false;
  if (!checkRate(ipBucket, wDay, RATE_LIMIT_DAY, database)) return false;

  incrementRate(userBucket, w10, database);
  incrementRate(userBucket, wDay, database);
  incrementRate(ipBucket, w10, database);
  incrementRate(ipBucket, wDay, database);

  return true;
}

// --- Challenge store ---

export function insertChallenge(
  params: {
    id: string;
    tokenHash: string;
    email: string;
    emailHash: string;
    tgUserId: number;
    display: number;
    buttons: number[];
    expiresAt: number;
    isEnrollment?: boolean;
  },
  database: Database.Database,
): void {
  database
    .prepare(
      `INSERT INTO tg_passwordless_challenges
        (id, token_hash, email, email_hash, tg_user_id, display_number, button_numbers_json,
         expires_at, is_enrollment, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      params.id,
      params.tokenHash,
      params.email,
      params.emailHash,
      params.tgUserId,
      params.display,
      JSON.stringify(params.buttons),
      params.expiresAt,
      params.isEnrollment ? 1 : 0,
      Date.now(),
    );
}

export function getChallengeByHash(tokenHash: string, database: Database.Database): ChallengeRow | undefined {
  return database
    .prepare('SELECT * FROM tg_passwordless_challenges WHERE token_hash = ?')
    .get(tokenHash) as ChallengeRow | undefined;
}

export function getChallengeById(id: string, database: Database.Database): ChallengeRow | undefined {
  return database
    .prepare('SELECT * FROM tg_passwordless_challenges WHERE id = ?')
    .get(id) as ChallengeRow | undefined;
}

type EnrollmentRow = {
  email: string;
  challenge_id: string | null;
  expires_at: number;
  created_at: number;
};

function getEnrollment(email: string, database: Database.Database): EnrollmentRow | undefined {
  return database
    .prepare('SELECT email, challenge_id, expires_at, created_at FROM tg_passwordless_enrollments WHERE email = ?')
    .get(email) as EnrollmentRow | undefined;
}

function deleteEnrollment(email: string, database: Database.Database): void {
  database.prepare('DELETE FROM tg_passwordless_enrollments WHERE email = ?').run(email);
}

function getPasswordlessStatus(
  email: string,
  database: Database.Database,
): 'off' | 'active' | 'pending' {
  const row = database
    .prepare('SELECT tg_status FROM user_passwordless_settings WHERE email = ?')
    .get(email) as { tg_status: string } | undefined;
  if (row?.tg_status === 'active') return 'active';

  const enrollment = getEnrollment(email, database);
  if (enrollment && enrollment.expires_at >= Date.now()) return 'pending';

  return 'off';
}

function pendingEnrollmentDisplay(
  email: string,
  database: Database.Database,
): { displayNumber: number; pollAfterMs: number } | null {
  const enrollment = getEnrollment(email, database);
  if (!enrollment || enrollment.expires_at < Date.now() || !enrollment.challenge_id) return null;

  const challenge = getChallengeById(enrollment.challenge_id, database);
  if (!challenge || challenge.is_enrollment !== 1) return null;
  if (challenge.denied_at !== null || challenge.consumed_at !== null) return null;
  if (challenge.expires_at < Date.now()) return null;

  return { displayNumber: challenge.display_number, pollAfterMs: 2000 };
}

// --- Telegram API helpers (passwordless-specific) ---

function getBotToken(): string {
  return process.env.TG_APP_TOKEN || '';
}

export async function sendPasswordlessChallenge(
  challengeId: string,
  tgUserId: number,
  display: number,
  buttons: number[],
  database: Database.Database,
): Promise<void> {
  const botToken = getBotToken();
  if (!botToken) return;

  // Atomic reserve: only send once per challenge
  const result = database
    .prepare('UPDATE tg_passwordless_challenges SET send_count = 1 WHERE id = ? AND send_count = 0')
    .run(challengeId);

  if (result.changes !== 1) {
    console.log(`[tg-passwordless] send skipped for ${challengeId} — already reserved`);
    return;
  }

  const keyboard = buttons.map((n) => ({
    text: String(n),
    callback_data: `vlk:${challengeId}:${n}`,
  }));

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: tgUserId,
        text: '🔐 *VoiceLokal sign-in*\n\nTap the number shown on your screen.\n\n_Did not request this? Ignore it._',
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [keyboard] },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[tg-passwordless] sendMessage ${res.status}: ${body.slice(0, 200)}`);
    }
  } catch (err) {
    console.error('[tg-passwordless] sendMessage error:', err);
  }
}

async function editCallbackMessage(messageId: number, chatId: number, text: string): Promise<void> {
  const botToken = getBotToken();
  if (!botToken) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [] },
      }),
    });
  } catch {
    // best-effort — a Telegram error never blocks the auth record
  }
}

async function answerCallbackQuery(callbackQueryId: string, text: string): Promise<void> {
  const botToken = getBotToken();
  if (!botToken) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: false }),
    });
  } catch {
    // best-effort
  }
}

// --- Webhook callback_query handler ---

export async function handleCallbackQuery(
  query: CallbackQuery,
  database: Database.Database,
): Promise<void> {
  const data = query.data ?? '';
  if (!data.startsWith('vlk:')) return;

  const parts = data.split(':');
  if (parts.length !== 3) return;

  const [, challengeId, selectedNumberStr] = parts;
  const selectedNumber = parseInt(selectedNumberStr, 10);
  if (!challengeId || isNaN(selectedNumber)) return;

  const challenge = getChallengeById(challengeId, database);

  // Already resolved or not found — silently ack to avoid revealing challenge state
  if (!challenge || challenge.consumed_at !== null || challenge.denied_at !== null || challenge.approved_at !== null) {
    await answerCallbackQuery(query.id, '');
    return;
  }

  const now = Date.now();
  if (challenge.expires_at < now) {
    await answerCallbackQuery(query.id, 'This sign-in request has expired.');
    return;
  }

  // Anti-spoof: from.id MUST match the linked telegram_user_id for this challenge
  if (query.from.id !== challenge.tg_user_id) {
    // Silently ack — do not reveal challenge state to an unrelated user
    await answerCallbackQuery(query.id, '');
    return;
  }

  const chatId = query.message?.chat?.id ?? challenge.tg_user_id;
  const messageId = query.message?.message_id;

  if (selectedNumber === challenge.display_number) {
    database
      .prepare('UPDATE tg_passwordless_challenges SET approved_at = ? WHERE id = ?')
      .run(now, challengeId);
    if (messageId !== undefined) {
      await editCallbackMessage(messageId, chatId, '✅ *Signed in to VoiceLokal*\n\nYou can close this.');
    }
    await answerCallbackQuery(query.id, '✅ Signed in!');
  } else {
    // One wrong tap kills — set both denied_at and consumed_at simultaneously
    database
      .prepare('UPDATE tg_passwordless_challenges SET denied_at = ?, consumed_at = ? WHERE id = ?')
      .run(now, now, challengeId);
    if (messageId !== undefined) {
      await editCallbackMessage(
        messageId,
        chatId,
        '❌ *Sign-in denied*\n\nWrong number tapped. Please try again from the app.',
      );
    }
    await answerCallbackQuery(query.id, '❌ Sign-in denied.');
  }
}

// --- Router ---

export function tgPasswordlessRouter(database: Database.Database = getDb()): Router {
  const router = Router();

  router.post('/telegram/passwordless/start', async (req, res) => {
    const { email, turnstileToken } = req.body || {};
    const ip = String(
      (req.headers['x-forwarded-for'] as string | undefined) || req.socket.remoteAddress || 'unknown',
    );

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'missing email' });
    }

    const turnstileOk = await verifyTurnstile(turnstileToken ? String(turnstileToken) : '', ip);
    if (!turnstileOk) {
      return res.status(400).json({ error: 'turnstile verification failed' });
    }

    // Constant-time eligibility — always performs all 3 DB reads + async yield
    const eligibility = await resolveEligibility(email, database);
    if (!eligibility.eligible) {
      return res.json({ eligible: false });
    }

    const { tgUserId, emailHash } = eligibility;
    const now = Date.now();

    // Rate caps — check all buckets, then increment (no partial increments on block)
    if (!checkRateLimits(emailHash, ip, now, database)) {
      // Same shape as ineligible — do not reveal rate-limited state
      return res.json({ eligible: false });
    }

    const { raw: rawToken, hash: tokenHash } = generateChallengeToken();
    const { display, buttons } = buildNumberMatchSet();
    const challengeId = crypto.randomUUID();
    const expiresAt = now + CHALLENGE_TTL_MS;

    insertChallenge(
      { id: challengeId, tokenHash, email: email.toLowerCase().trim(), emailHash, tgUserId, display, buttons, expiresAt },
      database,
    );

    // Respond first — send is deferred via setImmediate to prevent timing enumeration
    res.json({ eligible: true, challengeToken: rawToken, displayNumber: display, expiresAt, pollAfterMs: 2000 });

    setImmediate(() => {
      sendPasswordlessChallenge(challengeId, tgUserId, display, buttons, database).catch((err: unknown) => {
        console.error('[tg-passwordless] deferred send error:', err);
      });
    });

    return;
  });

  router.get('/telegram/passwordless/status', (req, res) => {
    const rawToken = String(req.query.challengeToken ?? '');
    if (!rawToken) return res.status(400).json({ error: 'missing challengeToken' });

    const tokenHash = hashChallengeToken(rawToken);
    const challenge = getChallengeByHash(tokenHash, database);
    if (!challenge) return res.status(404).json({ error: 'not found' });

    const now = Date.now();
    let status: 'pending' | 'approved' | 'denied' | 'expired';
    if (challenge.denied_at !== null) {
      status = 'denied';
    } else if (challenge.approved_at !== null) {
      status = 'approved';
    } else if (challenge.expires_at < now) {
      status = 'expired';
    } else {
      status = 'pending';
    }

    return res.json({ status });
  });

  router.post('/telegram/passwordless/complete', (req, res) => {
    const { challengeToken } = req.body || {};
    if (!challengeToken || typeof challengeToken !== 'string') {
      return res.status(400).json({ error: 'missing challengeToken' });
    }

    const tokenHash = hashChallengeToken(challengeToken);
    const challenge = getChallengeByHash(tokenHash, database);
    if (!challenge) return res.status(400).json({ error: 'invalid token' });

    const now = Date.now();
    // Check terminal states first, then "not yet ready" states
    if (challenge.denied_at !== null) return res.status(400).json({ error: 'denied' });
    if (challenge.consumed_at !== null) return res.status(400).json({ error: 'already used' });
    if (challenge.approved_at === null) return res.status(400).json({ error: 'not approved' });
    if (challenge.expires_at < now) return res.status(400).json({ error: 'expired' });

    // Atomic single-use consume — changes !== 1 means a concurrent complete beat us
    const result = database
      .prepare(
        'UPDATE tg_passwordless_challenges SET consumed_at = ? WHERE token_hash = ? AND consumed_at IS NULL',
      )
      .run(now, tokenHash);

    if (result.changes !== 1) {
      return res.status(400).json({ error: 'already used' });
    }

    const sessionToken = createSession(challenge.email, database);
    res.setHeader(
      'Set-Cookie',
      serializeSessionCookie(req as Request, sessionToken, Math.floor(SESSION_TTL_MS / 1000)),
    );

    console.log(`[tg-passwordless] complete OK: email=${challenge.email} challenge=${challenge.id}`);

    return res.json({ ok: true, email: challenge.email });
  });

  const auth = requireAuth(database);

  router.get('/telegram/passwordless/settings', auth, (req, res) => {
    const authed = req as AuthenticatedRequest;
    const email = authed.user.email;

    const link = database
      .prepare('SELECT tg_user_id FROM telegram_links WHERE email = ?')
      .get(email) as { tg_user_id: number } | undefined;

    const status = getPasswordlessStatus(email, database);
    const pending = status === 'pending' ? pendingEnrollmentDisplay(email, database) : null;

    return res.json({
      linked: !!link,
      status,
      displayNumber: pending?.displayNumber,
      pollAfterMs: pending?.pollAfterMs,
    });
  });

  router.post('/telegram/passwordless/enroll', auth, (req, res) => {
    const authed = req as AuthenticatedRequest;
    const email = authed.user.email;

    const link = database
      .prepare('SELECT tg_user_id FROM telegram_links WHERE email = ?')
      .get(email) as { tg_user_id: number } | undefined;
    if (!link) return res.status(400).json({ error: 'telegram not linked' });

    if (getPasswordlessStatus(email, database) === 'active') {
      return res.status(400).json({ error: 'already active' });
    }

    deleteEnrollment(email, database);

    const now = Date.now();
    const emailNorm = email.toLowerCase().trim();
    const emailHash = crypto.createHash('sha256').update(emailNorm).digest('hex');
    const { raw: rawToken, hash: tokenHash } = generateChallengeToken();
    const { display, buttons } = buildNumberMatchSet();
    const challengeId = crypto.randomUUID();
    const expiresAt = now + CHALLENGE_TTL_MS;

    insertChallenge(
      {
        id: challengeId,
        tokenHash,
        email: emailNorm,
        emailHash,
        tgUserId: link.tg_user_id,
        display,
        buttons,
        expiresAt,
        isEnrollment: true,
      },
      database,
    );

    database
      .prepare(
        'INSERT OR REPLACE INTO tg_passwordless_enrollments (email, challenge_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
      )
      .run(emailNorm, challengeId, now + ENROLLMENT_TTL_MS, now);

    res.json({
      challengeToken: rawToken,
      displayNumber: display,
      expiresAt,
      pollAfterMs: 2000,
    });

    setImmediate(() => {
      sendPasswordlessChallenge(challengeId, link.tg_user_id, display, buttons, database).catch((err: unknown) => {
        console.error('[tg-passwordless] enrollment send error:', err);
      });
    });

    return;
  });

  router.post('/telegram/passwordless/verify-activate', auth, (req, res) => {
    const authed = req as AuthenticatedRequest;
    const email = authed.user.email;
    const { challengeToken } = req.body || {};
    if (!challengeToken || typeof challengeToken !== 'string') {
      return res.status(400).json({ error: 'missing challengeToken' });
    }

    const enrollment = getEnrollment(email, database);
    if (!enrollment || enrollment.expires_at < Date.now()) {
      return res.status(400).json({ error: 'no pending enrollment' });
    }

    const tokenHash = hashChallengeToken(challengeToken);
    const challenge = getChallengeByHash(tokenHash, database);
    if (!challenge || challenge.id !== enrollment.challenge_id) {
      return res.status(400).json({ error: 'invalid enrollment challenge' });
    }
    if (challenge.is_enrollment !== 1) return res.status(400).json({ error: 'not an enrollment challenge' });
    if (challenge.denied_at !== null) return res.status(400).json({ error: 'denied' });
    if (challenge.approved_at === null) return res.status(400).json({ error: 'not approved' });
    if (challenge.expires_at < Date.now()) return res.status(400).json({ error: 'expired' });

    const now = Date.now();
    database
      .prepare(
        'INSERT INTO user_passwordless_settings (email, tg_status, updated_at) VALUES (?, ?, ?)' +
          ' ON CONFLICT(email) DO UPDATE SET tg_status = excluded.tg_status, updated_at = excluded.updated_at',
      )
      .run(email, 'active', now);

    deleteEnrollment(email, database);
    destroyAllUserSessions(email, database);

    console.log(`[tg-passwordless] activated: email=${email}`);

    return res.json({ ok: true, status: 'active' });
  });

  router.post('/telegram/passwordless/disable', auth, (req, res) => {
    const authed = req as AuthenticatedRequest;
    const email = authed.user.email;
    const password = String(req.body?.password ?? '');
    if (!password) return res.status(400).json({ error: 'missing password' });

    const row = database
      .prepare('SELECT password_hash FROM users WHERE email = ?')
      .get(email) as { password_hash: string } | undefined;
    if (!row || !verifyPassword(password, row.password_hash)) {
      return res.status(401).json({ error: 'password incorrect' });
    }

    const now = Date.now();
    database
      .prepare(
        'INSERT INTO user_passwordless_settings (email, tg_status, updated_at) VALUES (?, ?, ?)' +
          ' ON CONFLICT(email) DO UPDATE SET tg_status = excluded.tg_status, updated_at = excluded.updated_at',
      )
      .run(email, 'off', now);

    deleteEnrollment(email, database);
    destroyAllUserSessions(email, database);

    res.setHeader('Set-Cookie', serializeSessionCookie(req, '', 0));

    console.log(`[tg-passwordless] disabled: email=${email}`);

    return res.json({ ok: true, status: 'off' });
  });

  return router;
}
