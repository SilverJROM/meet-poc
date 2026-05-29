import crypto from 'node:crypto';
import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';
import { parseCookies, serializeSessionCookie } from '../../lib/cookies.js';
import { SESSION_TTL_MS, createSession, getSessionUser } from '../auth/sessions.js';
import { listOwnedRooms } from '../rooms/store.js';

const BOT_TOKEN = process.env.TG_APP_TOKEN || '';
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://voice.silverjrom.app').replace(/\/$/, '');
const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;
const INIT_DATA_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type TelegramUser = { id: number; first_name?: string; last_name?: string; username?: string };
type TelegramChat = { id: number; type: string };
type TelegramMessage = { chat: TelegramChat; from?: TelegramUser; text?: string };
type TelegramUpdate = { update_id: number; message?: TelegramMessage };

type LinkRow = { tg_user_id: number; email: string; tg_username: string | null; tg_first_name: string | null };
type TokenRow = { token: string; tg_user_id: number; tg_username: string | null; tg_first_name: string | null; expires_at: number };

export function telegramRouter(database: Database.Database = getDb()): Router {
  const router = Router();

  router.post('/telegram/webhook', async (req, res) => {
    if (!BOT_TOKEN) {
      return res.status(503).json({ error: 'telegram not configured' });
    }
    const update = req.body as TelegramUpdate | undefined;
    try {
      await handleUpdate(update, database);
    } catch (err) {
      console.error('[telegram] webhook handler failed', err);
    }
    return res.json({ ok: true });
  });

  // Used by the Telegram Mini App in the browser: sends Telegram's initData,
  // we verify the HMAC against the bot token, then issue a session cookie for
  // the linked email. If the tg user isn't linked yet, returns 403.
  router.post('/auth/telegram', (req, res) => {
    if (!BOT_TOKEN) return res.status(503).json({ error: 'telegram not configured' });
    const initData = String(req.body?.initData || '');
    if (!initData) return res.status(400).json({ error: 'missing initData' });

    const verified = verifyInitData(initData, BOT_TOKEN);
    if (!verified.ok) {
      console.log(`[telegram] initData rejected: ${verified.reason}`);
      return res.status(401).json({ error: 'invalid initData' });
    }

    const tgUser = verified.user;
    if (!tgUser) return res.status(400).json({ error: 'no user in initData' });

    const link = database
      .prepare('SELECT tg_user_id, email, tg_username, tg_first_name FROM telegram_links WHERE tg_user_id = ?')
      .get(tgUser.id) as LinkRow | undefined;

    if (!link) {
      return res.status(403).json({
        error: 'not_linked',
        message: 'Run /link in the bot to connect your meet-poc account.',
      });
    }

    const token = createSession(link.email, database);
    res.setHeader('Set-Cookie', serializeSessionCookie(req, token, Math.floor(SESSION_TTL_MS / 1000)));
    console.log(`[telegram] auto-auth OK: tg ${tgUser.id} -> ${link.email}`);
    const sessionUser = getSessionUser(token, database);
    return res.json({
      email: link.email,
      displayName: sessionUser?.displayName ?? link.email.split('@')[0] ?? link.email,
      isAdmin: sessionUser?.isAdmin ?? false,
    });
  });

  // Consume a /link token while authenticated. Ties the requesting account to
  // the telegram user that generated the token in the bot.
  router.post('/telegram/link', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const user = getSessionUser(cookies.session, database);
    if (!user) return res.status(401).json({ error: 'not authenticated' });

    const linkToken = String(req.body?.token || '');
    if (!linkToken) return res.status(400).json({ error: 'missing token' });

    const now = Date.now();
    database.prepare('DELETE FROM telegram_link_tokens WHERE expires_at < ?').run(now);

    const row = database
      .prepare('SELECT token, tg_user_id, tg_username, tg_first_name, expires_at FROM telegram_link_tokens WHERE token = ?')
      .get(linkToken) as TokenRow | undefined;
    if (!row) return res.status(400).json({ error: 'invalid or expired token' });

    const tx = database.transaction(() => {
      database
        .prepare(
          `INSERT INTO telegram_links (tg_user_id, email, tg_username, tg_first_name, linked_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(tg_user_id) DO UPDATE SET email = excluded.email, tg_username = excluded.tg_username, tg_first_name = excluded.tg_first_name, linked_at = excluded.linked_at`,
        )
        .run(row.tg_user_id, user.email, row.tg_username, row.tg_first_name, now);
      database.prepare('DELETE FROM telegram_link_tokens WHERE token = ?').run(linkToken);
    });
    tx();

    console.log(`[telegram] linked tg ${row.tg_user_id} -> ${user.email}`);

    // Best-effort confirmation DM. Don't fail the request if Telegram is slow.
    void sendMessage(row.tg_user_id, `✅ Linked to *${user.email}*. Open the menu button to launch VoiceLokal — you're auto-signed-in from now on.`).catch(
      (err) => console.warn('[telegram] confirmation DM failed', err),
    );

    return res.json({ ok: true });
  });

  return router;
}

async function handleUpdate(update: TelegramUpdate | undefined, database: Database.Database): Promise<void> {
  const message = update?.message;
  if (!message || !message.text || !message.from) {
    console.log('[telegram] update ignored (no message/text/from):', JSON.stringify(update));
    return;
  }
  const chatId = message.chat.id;
  const from = message.from;
  const text = message.text.trim();
  console.log(`[telegram] update from tg ${from.id} (${from.username ?? from.first_name ?? '?'}) chat ${chatId}: ${text}`);

  // Strip bot mention (e.g. /link@MyBot -> /link).
  const command = text.split(/\s+/)[0].split('@')[0].toLowerCase();

  if (command === '/start' || command === '/help') {
    await sendMessage(
      chatId,
      [
        '👋 *VoiceLokal*',
        '',
        'Use the menu button to open the mini-app (auto-login once linked).',
        '',
        '`/link` — connect this Telegram account to your VoiceLokal login',
        '`/list_rooms` — show your active rooms',
      ].join('\n'),
    );
    return;
  }

  if (command === '/link') {
    const token = crypto.randomBytes(24).toString('base64url');
    const now = Date.now();
    database
      .prepare(
        `INSERT INTO telegram_link_tokens (token, tg_user_id, tg_username, tg_first_name, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(token, from.id, from.username ?? null, from.first_name ?? null, now, now + LINK_TOKEN_TTL_MS);

    const url = `${PUBLIC_URL}/app/link?token=${encodeURIComponent(token)}`;
    await sendMessage(
      chatId,
      `🔗 Tap to connect this Telegram account to your meet-poc login (valid 15 min):\n${url}`,
    );
    return;
  }

  if (command === '/list_rooms') {
    const link = database
      .prepare('SELECT tg_user_id, email, tg_username, tg_first_name FROM telegram_links WHERE tg_user_id = ?')
      .get(from.id) as LinkRow | undefined;
    if (!link) {
      await sendMessage(chatId, 'You are not linked yet. Send `/link` first.');
      return;
    }
    const allRooms = listOwnedRooms(link.email, database);
    const openRooms = allRooms.filter((r) => r.isOpen);
    const rooms = openRooms.length ? openRooms : allRooms.slice(0, 10);
    if (!rooms.length) {
      await sendMessage(chatId, 'No rooms yet. Open the mini-app to create one.');
      return;
    }
    const heading = openRooms.length ? 'Your open rooms:' : 'Your recent rooms (none currently open):';
    const lines = rooms.slice(0, 20).map((r) => {
      const slug = r.slug || r.id;
      return `• *${escapeMd(r.title)}* — ${PUBLIC_URL}/app/join?code=${encodeURIComponent(slug)}`;
    });
    await sendMessage(chatId, `${heading}\n${lines.join('\n')}`);
    return;
  }

  await sendMessage(chatId, 'Unknown command. Try `/help`.');
}

export async function notifyOwnerLobbyPending(
  ownerEmail: string,
  roomTitle: string,
  waiterName: string,
  database: Database.Database = getDb(),
): Promise<void> {
  if (!BOT_TOKEN) return;
  const links = database
    .prepare('SELECT tg_user_id FROM telegram_links WHERE email = ?')
    .all(ownerEmail) as { tg_user_id: number }[];
  if (!links.length) return;
  const text = `🔔 *${escapeMd(waiterName)}* is waiting in the lobby of *${escapeMd(roomTitle)}*.`;
  await Promise.all(
    links.map((row) =>
      sendMessage(row.tg_user_id, text).catch((err) => {
        console.warn(`[telegram] lobby DM to ${row.tg_user_id} failed`, err);
      }),
    ),
  );
}

type InitDataResult =
  | { ok: true; user: TelegramUser | null; authDate: number }
  | { ok: false; reason: string };

function verifyInitData(initData: string, botToken: string): InitDataResult {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'no hash' };
  params.delete('hash');

  const entries: string[] = [];
  params.forEach((value, key) => entries.push(`${key}=${value}`));
  entries.sort();
  const dataCheckString = entries.join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (computed !== hash) return { ok: false, reason: 'bad hash' };

  const authDateRaw = params.get('auth_date');
  const authDate = authDateRaw ? Number(authDateRaw) * 1000 : 0;
  if (!authDate || Date.now() - authDate > INIT_DATA_MAX_AGE_MS) {
    return { ok: false, reason: 'stale auth_date' };
  }

  let user: TelegramUser | null = null;
  const userJson = params.get('user');
  if (userJson) {
    try {
      user = JSON.parse(userJson) as TelegramUser;
    } catch {
      return { ok: false, reason: 'bad user json' };
    }
  }

  return { ok: true, user, authDate };
}

async function sendMessage(chatId: number, text: string): Promise<void> {
  if (!BOT_TOKEN) return;
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`telegram sendMessage ${res.status}: ${body.slice(0, 200)}`);
  }
}

function escapeMd(input: string): string {
  return input.replace(/([_*`\[\]])/g, '\\$1');
}
