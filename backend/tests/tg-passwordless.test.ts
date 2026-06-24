import request from 'supertest';
import crypto from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp } from '../src/server.js';
import { createTestDb } from './helpers.js';
import {
  resolveEligibility,
  checkRateLimits,
  getChallengeByHash,
  getChallengeById,
  sendPasswordlessChallenge,
  handleCallbackQuery,
  type CallbackQuery,
} from '../src/modules/telegram/tg-passwordless.js';
import { generateChallengeToken, hashChallengeToken } from '../src/lib/tg-crypto.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { hashPassword } from '../src/lib/passwords.js';

const TEST_EMAIL = 'tg-pwdless@example.com';
const TEST_TG_USER_ID = 12345678;
const OTHER_TG_USER_ID = 99999999;
const RATE_WINDOW_10MIN_MS = 10 * 60 * 1000;

// --- Test DB helpers ---

function insertUser(db: ReturnType<typeof createTestDb>, email: string): void {
  db.prepare('INSERT OR IGNORE INTO users (email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(email, 'x:x', Date.now(), Date.now());
}

function insertTelegramLink(db: ReturnType<typeof createTestDb>, email: string, tgUserId: number): void {
  db.prepare('INSERT OR REPLACE INTO telegram_links (tg_user_id, email, linked_at) VALUES (?, ?, ?)')
    .run(tgUserId, email, Date.now());
}

function setPasswordlessActive(db: ReturnType<typeof createTestDb>, email: string): void {
  db.prepare('INSERT OR REPLACE INTO user_passwordless_settings (email, tg_status, updated_at) VALUES (?, ?, ?)')
    .run(email, 'active', Date.now());
}

function insertChallengeRow(
  db: ReturnType<typeof createTestDb>,
  params: {
    id: string;
    tokenHash: string;
    email: string;
    emailHash: string;
    tgUserId: number;
    display: number;
    buttons: number[];
    expiresAt: number;
    approvedAt?: number | null;
    deniedAt?: number | null;
    consumedAt?: number | null;
  },
): void {
  db.prepare(
    `INSERT INTO tg_passwordless_challenges
      (id, token_hash, email, email_hash, tg_user_id, display_number, button_numbers_json,
       expires_at, approved_at, denied_at, consumed_at, send_count, is_enrollment, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
  ).run(
    params.id,
    params.tokenHash,
    params.email,
    params.emailHash,
    params.tgUserId,
    params.display,
    JSON.stringify(params.buttons),
    params.expiresAt,
    params.approvedAt ?? null,
    params.deniedAt ?? null,
    params.consumedAt ?? null,
    Date.now(),
  );
}

// Mock fetch: all Telegram API calls succeed by default
const mockTgFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ ok: true }),
  text: async () => '{"ok":true}',
} as Response);

function responseCookieString(res: request.Response): string {
  const cookies = (res.headers['set-cookie'] as string[] | string | undefined) ?? [];
  return Array.isArray(cookies) ? cookies.join(';') : cookies;
}

function ipBucket(emailHash: string, ip: string): string {
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
  return `ip:${ipHash}:${emailHash}`;
}

// --- Eligibility (constant-time shape) ---

describe('eligibility — constant-time anti-enumeration', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns {eligible:false} for unknown email', async () => {
    const result = await resolveEligibility('nobody@example.com', db);
    expect(result).toEqual({ eligible: false });
  });

  it('returns {eligible:false} for user with no passwordless_settings row', async () => {
    insertUser(db, TEST_EMAIL);
    insertTelegramLink(db, TEST_EMAIL, TEST_TG_USER_ID);
    // No user_passwordless_settings row → tg_status defaults to missing → ineligible
    const result = await resolveEligibility(TEST_EMAIL, db);
    expect(result).toEqual({ eligible: false });
  });

  it('returns {eligible:false} for user with tg_status=off', async () => {
    insertUser(db, TEST_EMAIL);
    insertTelegramLink(db, TEST_EMAIL, TEST_TG_USER_ID);
    db.prepare('INSERT INTO user_passwordless_settings (email, tg_status, updated_at) VALUES (?, ?, ?)')
      .run(TEST_EMAIL, 'off', Date.now());
    const result = await resolveEligibility(TEST_EMAIL, db);
    expect(result).toEqual({ eligible: false });
  });

  it('returns {eligible:false} for active user with no telegram link', async () => {
    insertUser(db, TEST_EMAIL);
    setPasswordlessActive(db, TEST_EMAIL);
    // No telegram_links row
    const result = await resolveEligibility(TEST_EMAIL, db);
    expect(result).toEqual({ eligible: false });
  });

  it('all ineligible paths return identical {eligible:false} shape', async () => {
    // Verify shape is identical regardless of which condition fails
    const r1 = await resolveEligibility('ghost@example.com', db);
    insertUser(db, TEST_EMAIL);
    const r2 = await resolveEligibility(TEST_EMAIL, db); // no settings, no link
    expect(r1).toEqual({ eligible: false });
    expect(r2).toEqual({ eligible: false });
    expect(r1).toEqual(r2);
  });

  it('returns {eligible:true, tgUserId, emailHash} when all conditions met', async () => {
    insertUser(db, TEST_EMAIL);
    setPasswordlessActive(db, TEST_EMAIL);
    insertTelegramLink(db, TEST_EMAIL, TEST_TG_USER_ID);
    const result = await resolveEligibility(TEST_EMAIL, db);
    expect(result.eligible).toBe(true);
    if (result.eligible) {
      expect(result.tgUserId).toBe(TEST_TG_USER_ID);
      expect(result.emailHash).toHaveLength(64); // SHA-256 hex
    }
  });
});

// --- Rate limits ---

describe('rate limits', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('allows 3 requests then blocks the 4th (per-user 10min cap)', () => {
    const emailHash = 'aabbccdd';
    const ip = '10.0.0.1';
    const now = Date.now();

    expect(checkRateLimits(emailHash, ip, now, db)).toBe(true);
    expect(checkRateLimits(emailHash, ip, now, db)).toBe(true);
    expect(checkRateLimits(emailHash, ip, now, db)).toBe(true);
    expect(checkRateLimits(emailHash, ip, now, db)).toBe(false); // 4th blocked
  });

  it('does not partially increment on block — failed check leaves buckets unchanged', () => {
    const emailHash = 'eeffc0de';
    const ip = '10.0.0.2';
    const now = Date.now();

    // Fill up the per-user 10min bucket to the limit
    checkRateLimits(emailHash, ip, now, db);
    checkRateLimits(emailHash, ip, now, db);
    checkRateLimits(emailHash, ip, now, db);

    // 4th would be blocked — verify count is exactly 3, not 4
    checkRateLimits(emailHash, ip, now, db);

    const row = db
      .prepare("SELECT count FROM tg_passwordless_rate WHERE bucket = ? AND window_key LIKE '10m:%'")
      .get(`user:${emailHash}`) as { count: number } | undefined;
    expect(row?.count).toBe(3);

    const ipRow = db
      .prepare("SELECT count FROM tg_passwordless_rate WHERE bucket = ? AND window_key LIKE '10m:%'")
      .get(ipBucket(emailHash, ip)) as { count: number } | undefined;
    expect(ipRow?.count).toBe(3);
  });

  it('blocks the 4th request across different IPs for the same user bucket', () => {
    const emailHash = 'crossipuser';
    const now = Date.now();

    expect(checkRateLimits(emailHash, '10.0.1.1', now, db)).toBe(true);
    expect(checkRateLimits(emailHash, '10.0.1.2', now, db)).toBe(true);
    expect(checkRateLimits(emailHash, '10.0.1.3', now, db)).toBe(true);
    expect(checkRateLimits(emailHash, '10.0.1.4', now, db)).toBe(false);

    const userRow = db
      .prepare("SELECT count FROM tg_passwordless_rate WHERE bucket = ? AND window_key LIKE '10m:%'")
      .get(`user:${emailHash}`) as { count: number } | undefined;
    expect(userRow?.count).toBe(3);

    const ipRows = db
      .prepare("SELECT COUNT(*) AS count FROM tg_passwordless_rate WHERE bucket LIKE ? AND window_key LIKE '10m:%'")
      .get(`ip:%:${emailHash}`) as { count: number };
    expect(ipRows.count).toBe(3);
  });

  it('blocks the 11th request across distinct 10-minute windows in one day', () => {
    const emailHash = 'daycapuser';
    const ip = '10.0.2.1';
    const startOfDay = Date.UTC(2026, 0, 1, 0, 0, 0);

    for (let i = 0; i < 10; i += 1) {
      expect(checkRateLimits(emailHash, ip, startOfDay + i * RATE_WINDOW_10MIN_MS, db)).toBe(true);
    }
    expect(checkRateLimits(emailHash, ip, startOfDay + 10 * RATE_WINDOW_10MIN_MS, db)).toBe(false);

    const userDayRow = db
      .prepare("SELECT count FROM tg_passwordless_rate WHERE bucket = ? AND window_key LIKE 'day:%'")
      .get(`user:${emailHash}`) as { count: number } | undefined;
    const ipDayRow = db
      .prepare("SELECT count FROM tg_passwordless_rate WHERE bucket = ? AND window_key LIKE 'day:%'")
      .get(ipBucket(emailHash, ip)) as { count: number } | undefined;

    expect(userDayRow?.count).toBe(10);
    expect(ipDayRow?.count).toBe(10);
  });
});

// --- Start endpoint ---

describe('POST /api/telegram/passwordless/start', () => {
  let db: ReturnType<typeof createTestDb>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createTestDb();
    app = createApp(db);
    process.env.TG_APP_TOKEN = 'test-bot-token';
    delete process.env.CF_TURNSTILE_SECRET; // dev mode: Turnstile skipped
    delete process.env.TG_WEBHOOK_SECRET;   // no secret check in start tests
    vi.stubGlobal('fetch', mockTgFetch);
    mockTgFetch.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TG_APP_TOKEN;
  });

  it('returns {eligible:false} for unknown email', async () => {
    const res = await request(app)
      .post('/api/telegram/passwordless/start')
      .send({ email: 'nobody@example.com', turnstileToken: 'tok' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ eligible: false });
  });

  it('returns challenge fields for an eligible user', async () => {
    insertUser(db, TEST_EMAIL);
    setPasswordlessActive(db, TEST_EMAIL);
    insertTelegramLink(db, TEST_EMAIL, TEST_TG_USER_ID);

    const res = await request(app)
      .post('/api/telegram/passwordless/start')
      .send({ email: TEST_EMAIL, turnstileToken: 'tok' });

    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(true);
    expect(typeof res.body.challengeToken).toBe('string');
    expect(res.body.displayNumber).toBeGreaterThanOrEqual(10);
    expect(res.body.displayNumber).toBeLessThanOrEqual(99);
    expect(typeof res.body.expiresAt).toBe('number');
    expect(res.body.pollAfterMs).toBe(2000);

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  });

  it('persists a challenge row in the DB', async () => {
    insertUser(db, TEST_EMAIL);
    setPasswordlessActive(db, TEST_EMAIL);
    insertTelegramLink(db, TEST_EMAIL, TEST_TG_USER_ID);

    const res = await request(app)
      .post('/api/telegram/passwordless/start')
      .send({ email: TEST_EMAIL, turnstileToken: 'tok' });

    const tokenHash = hashChallengeToken(res.body.challengeToken as string);
    const row = getChallengeByHash(tokenHash, db);
    expect(row).toBeTruthy();
    expect(row!.display_number).toBe(res.body.displayNumber as number);
    expect(row!.tg_user_id).toBe(TEST_TG_USER_ID);
    expect(row!.email).toBe(TEST_EMAIL.toLowerCase());

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  });

  it('defers the Telegram send — fires after response via setImmediate', async () => {
    insertUser(db, TEST_EMAIL);
    setPasswordlessActive(db, TEST_EMAIL);
    insertTelegramLink(db, TEST_EMAIL, TEST_TG_USER_ID);

    await request(app)
      .post('/api/telegram/passwordless/start')
      .send({ email: TEST_EMAIL, turnstileToken: 'tok' });

    // Flush setImmediate queue and any micro-tasks from the async send
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(mockTgFetch).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns the eligible response before a slow deferred Telegram send finishes', async () => {
    insertUser(db, TEST_EMAIL);
    setPasswordlessActive(db, TEST_EMAIL);
    insertTelegramLink(db, TEST_EMAIL, TEST_TG_USER_ID);

    const slowFetch = vi.fn(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
      return {
        ok: true,
        json: async () => ({ ok: true }),
        text: async () => '{"ok":true}',
      } as Response;
    });
    vi.stubGlobal('fetch', slowFetch);

    const startedAt = Date.now();
    const res = await request(app)
      .post('/api/telegram/passwordless/start')
      .send({ email: TEST_EMAIL, turnstileToken: 'tok' });

    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(true);
    expect(typeof res.body.challengeToken).toBe('string');

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    expect(slowFetch).toHaveBeenCalledOnce();
  });

  it('does not enqueue a Telegram send for an ineligible email', async () => {
    const res = await request(app)
      .post('/api/telegram/passwordless/start')
      .send({ email: 'nobody@example.com', turnstileToken: 'tok' });

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ eligible: false });
    expect(mockTgFetch).not.toHaveBeenCalled();
  });

  it('rate-limits the 4th request — returns same shape as ineligible', async () => {
    insertUser(db, TEST_EMAIL);
    setPasswordlessActive(db, TEST_EMAIL);
    insertTelegramLink(db, TEST_EMAIL, TEST_TG_USER_ID);

    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/telegram/passwordless/start')
        .send({ email: TEST_EMAIL, turnstileToken: 'tok' });
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 50)); // flush sends
    mockTgFetch.mockClear();

    const res = await request(app)
      .post('/api/telegram/passwordless/start')
      .send({ email: TEST_EMAIL, turnstileToken: 'tok' });
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ eligible: false }); // same shape as ineligible
    expect(mockTgFetch).not.toHaveBeenCalled();
  });
});

// --- Send (inline keyboard) ---

describe('sendPasswordlessChallenge — Telegram message format', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    process.env.TG_APP_TOKEN = 'test-bot-token';
    vi.stubGlobal('fetch', mockTgFetch);
    mockTgFetch.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TG_APP_TOKEN;
  });

  it('sends inline keyboard with vlk: prefix and exactly 3 buttons', async () => {
    insertUser(db, TEST_EMAIL);
    insertTelegramLink(db, TEST_EMAIL, TEST_TG_USER_ID);

    const { hash } = generateChallengeToken();
    const challengeId = 'send-test-challenge';
    const display = 42;
    const buttons = [17, 42, 83];

    insertChallengeRow(db, {
      id: challengeId,
      tokenHash: hash,
      email: TEST_EMAIL,
      emailHash: 'eh',
      tgUserId: TEST_TG_USER_ID,
      display,
      buttons,
      expiresAt: Date.now() + 120000,
    });

    await sendPasswordlessChallenge(challengeId, TEST_TG_USER_ID, display, buttons, db);

    expect(mockTgFetch).toHaveBeenCalledOnce();
    const [url, init] = mockTgFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/sendMessage');

    const body = JSON.parse(init.body as string) as {
      chat_id: number;
      reply_markup: { inline_keyboard: { text: string; callback_data: string }[][] };
    };
    expect(body.chat_id).toBe(TEST_TG_USER_ID);

    const keyboard = body.reply_markup.inline_keyboard[0];
    expect(keyboard).toHaveLength(3);

    const callbackData = keyboard.map((b) => b.callback_data);
    for (const cd of callbackData) {
      expect(cd).toMatch(/^vlk:send-test-challenge:\d+$/);
    }

    // All 3 button numbers match the original buttons array
    const btnNumbers = keyboard.map((b) => parseInt(b.callback_data.split(':')[2], 10)).sort((a, b) => a - b);
    expect(btnNumbers).toEqual([...buttons].sort((a, b) => a - b));
  });

  it('does not send twice — atomic reserve-before-send', async () => {
    insertUser(db, TEST_EMAIL);
    insertTelegramLink(db, TEST_EMAIL, TEST_TG_USER_ID);

    const { hash } = generateChallengeToken();
    const challengeId = 'no-resend-challenge';
    const display = 55;
    const buttons = [22, 55, 77];

    insertChallengeRow(db, {
      id: challengeId,
      tokenHash: hash,
      email: TEST_EMAIL,
      emailHash: 'eh',
      tgUserId: TEST_TG_USER_ID,
      display,
      buttons,
      expiresAt: Date.now() + 120000,
    });

    await sendPasswordlessChallenge(challengeId, TEST_TG_USER_ID, display, buttons, db);
    await sendPasswordlessChallenge(challengeId, TEST_TG_USER_ID, display, buttons, db); // second call

    expect(mockTgFetch).toHaveBeenCalledOnce(); // reserve prevents second send
  });

  it('does not double-send under concurrent reservation attempts', async () => {
    insertUser(db, TEST_EMAIL);
    insertTelegramLink(db, TEST_EMAIL, TEST_TG_USER_ID);

    const { hash } = generateChallengeToken();
    const challengeId = 'parallel-reserve-challenge';
    const display = 66;
    const buttons = [11, 66, 88];

    insertChallengeRow(db, {
      id: challengeId,
      tokenHash: hash,
      email: TEST_EMAIL,
      emailHash: 'eh',
      tgUserId: TEST_TG_USER_ID,
      display,
      buttons,
      expiresAt: Date.now() + 120000,
    });

    await Promise.all([
      sendPasswordlessChallenge(challengeId, TEST_TG_USER_ID, display, buttons, db),
      sendPasswordlessChallenge(challengeId, TEST_TG_USER_ID, display, buttons, db),
      sendPasswordlessChallenge(challengeId, TEST_TG_USER_ID, display, buttons, db),
    ]);

    const row = getChallengeById(challengeId, db)!;
    expect(row.send_count).toBe(1);
    expect(mockTgFetch).toHaveBeenCalledOnce();
  });
});

// --- Webhook secret-token gate ---

describe('POST /api/telegram/webhook — secret-token gate', () => {
  let db: ReturnType<typeof createTestDb>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createTestDb();
    app = createApp(db);
    process.env.TG_APP_TOKEN = 'test-bot-token';
    process.env.TG_WEBHOOK_SECRET = 'test-webhook-secret-xyzabc';
    vi.stubGlobal('fetch', mockTgFetch);
    mockTgFetch.mockClear();
    insertUser(db, TEST_EMAIL);
    insertTelegramLink(db, TEST_EMAIL, TEST_TG_USER_ID);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TG_APP_TOKEN;
    delete process.env.TG_WEBHOOK_SECRET;
  });

  it('returns 401 when secret header is missing', async () => {
    const res = await request(app)
      .post('/api/telegram/webhook')
      .send({ update_id: 1, message: { chat: { id: 1, type: 'private' }, from: { id: 1 }, text: '/help' } });
    expect(res.status).toBe(401);
  });

  it('returns 401 when secret header is wrong', async () => {
    const res = await request(app)
      .post('/api/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', 'wrong-secret')
      .send({ update_id: 1, message: { chat: { id: 1, type: 'private' }, from: { id: 1 }, text: '/help' } });
    expect(res.status).toBe(401);
  });

  it('rejects length-mismatched secret guesses with the same unauthorized shape', async () => {
    const payload = { update_id: 1, message: { chat: { id: 1, type: 'private' }, from: { id: 1 }, text: '/help' } };

    const short = await request(app)
      .post('/api/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', 'test-webhook-secret-xyzab')
      .send(payload);
    const long = await request(app)
      .post('/api/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', 'test-webhook-secret-xyzabc!')
      .send(payload);

    expect(short.status).toBe(401);
    expect(long.status).toBe(401);
    expect(short.body).toEqual({ error: 'unauthorized' });
    expect(long.body).toEqual(short.body);
  });

  it('does not dispatch callbacks when the secret header is wrong', async () => {
    const { hash } = generateChallengeToken();
    const challengeId = 'wrong-secret-no-dispatch';
    insertChallengeRow(db, {
      id: challengeId,
      tokenHash: hash,
      email: TEST_EMAIL,
      emailHash: 'eh',
      tgUserId: TEST_TG_USER_ID,
      display: 42,
      buttons: [17, 42, 83],
      expiresAt: Date.now() + 120000,
    });

    const res = await request(app)
      .post('/api/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', 'wrong-secret')
      .send({
        update_id: 1,
        callback_query: {
          id: 'q-wrong-secret',
          from: { id: TEST_TG_USER_ID },
          message: { message_id: 100, chat: { id: TEST_TG_USER_ID } },
          data: `vlk:${challengeId}:42`,
        },
      });

    const row = getChallengeById(challengeId, db)!;
    expect(res.status).toBe(401);
    expect(row.approved_at).toBeNull();
  });

  it('returns 200 with correct secret header', async () => {
    const { hash } = generateChallengeToken();
    const challengeId = 'webhook-secret-test';
    insertChallengeRow(db, {
      id: challengeId,
      tokenHash: hash,
      email: TEST_EMAIL,
      emailHash: 'eh',
      tgUserId: TEST_TG_USER_ID,
      display: 42,
      buttons: [17, 42, 83],
      expiresAt: Date.now() + 120000,
    });

    const res = await request(app)
      .post('/api/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', 'test-webhook-secret-xyzabc')
      .send({
        update_id: 1,
        callback_query: {
          id: 'q1',
          from: { id: TEST_TG_USER_ID },
          message: { message_id: 100, chat: { id: TEST_TG_USER_ID } },
          data: `vlk:${challengeId}:42`,
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// --- Webhook callback_query handler (direct unit tests) ---

describe('handleCallbackQuery — callback outcomes', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    process.env.TG_APP_TOKEN = 'test-bot-token';
    vi.stubGlobal('fetch', mockTgFetch);
    mockTgFetch.mockClear();
    insertUser(db, TEST_EMAIL);
    insertTelegramLink(db, TEST_EMAIL, TEST_TG_USER_ID);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TG_APP_TOKEN;
  });

  function makeChallenge(overrides: Partial<{
    expiresAt: number;
    display: number;
    buttons: number[];
    approvedAt: number | null;
    deniedAt: number | null;
    consumedAt: number | null;
  }> = {}): { id: string; raw: string; display: number; buttons: number[] } {
    const { raw, hash } = generateChallengeToken();
    const id = `cb-${Math.random().toString(36).slice(2)}`;
    const display = overrides.display ?? 42;
    const buttons = overrides.buttons ?? [17, 42, 83];
    insertChallengeRow(db, {
      id,
      tokenHash: hash,
      email: TEST_EMAIL,
      emailHash: 'eh',
      tgUserId: TEST_TG_USER_ID,
      display,
      buttons,
      expiresAt: overrides.expiresAt ?? Date.now() + 120000,
      approvedAt: overrides.approvedAt,
      deniedAt: overrides.deniedAt,
      consumedAt: overrides.consumedAt,
    });
    return { id, raw, display, buttons };
  }

  it('correct number → approved_at set, denied_at/consumed_at remain null', async () => {
    const { id, display } = makeChallenge();
    const query: CallbackQuery = {
      id: 'q-correct',
      from: { id: TEST_TG_USER_ID },
      message: { message_id: 100, chat: { id: TEST_TG_USER_ID } },
      data: `vlk:${id}:${display}`,
    };
    await handleCallbackQuery(query, db);

    const row = getChallengeById(id, db)!;
    expect(row.approved_at).toBeTruthy();
    expect(row.denied_at).toBeNull();
    expect(row.consumed_at).toBeNull();
  });

  it('wrong number → denied_at + consumed_at set simultaneously (one-wrong-tap-kills)', async () => {
    const { id, display } = makeChallenge({ display: 42, buttons: [17, 42, 83] });
    const wrongNumber = 17; // not the display number (42)
    const query: CallbackQuery = {
      id: 'q-wrong',
      from: { id: TEST_TG_USER_ID },
      message: { message_id: 100, chat: { id: TEST_TG_USER_ID } },
      data: `vlk:${id}:${wrongNumber}`,
    };
    await handleCallbackQuery(query, db);

    const row = getChallengeById(id, db)!;
    expect(row.denied_at).toBeTruthy();
    expect(row.consumed_at).toBeTruthy();
    expect(row.approved_at).toBeNull();
    // Both set to same timestamp (simultaneously)
    expect(row.denied_at).toBe(row.consumed_at);
  });

  it('foreign from.id → silently acked, challenge state untouched', async () => {
    const { id, display } = makeChallenge();
    const query: CallbackQuery = {
      id: 'q-spoof',
      from: { id: OTHER_TG_USER_ID }, // wrong user
      message: { message_id: 100, chat: { id: OTHER_TG_USER_ID } },
      data: `vlk:${id}:${display}`,
    };
    await handleCallbackQuery(query, db);

    const row = getChallengeById(id, db)!;
    expect(row.approved_at).toBeNull();
    expect(row.denied_at).toBeNull();
    expect(row.consumed_at).toBeNull();
  });

  it('foreign from.id cannot approve even when chat.id matches the victim', async () => {
    const { id, display } = makeChallenge();
    const query: CallbackQuery = {
      id: 'q-spoof-chat',
      from: { id: OTHER_TG_USER_ID },
      message: { message_id: 100, chat: { id: TEST_TG_USER_ID } },
      data: `vlk:${id}:${display}`,
    };
    await handleCallbackQuery(query, db);

    const row = getChallengeById(id, db)!;
    expect(row.approved_at).toBeNull();
    expect(row.denied_at).toBeNull();
    expect(row.consumed_at).toBeNull();
  });

  it('wrong tap consumes the challenge so a later correct tap cannot revive it', async () => {
    const { id, display } = makeChallenge({ display: 42, buttons: [17, 42, 83] });
    await handleCallbackQuery(
      {
        id: 'q-wrong-first',
        from: { id: TEST_TG_USER_ID },
        message: { message_id: 100, chat: { id: TEST_TG_USER_ID } },
        data: `vlk:${id}:17`,
      },
      db,
    );
    const deniedRow = getChallengeById(id, db)!;

    await handleCallbackQuery(
      {
        id: 'q-correct-after-wrong',
        from: { id: TEST_TG_USER_ID },
        message: { message_id: 100, chat: { id: TEST_TG_USER_ID } },
        data: `vlk:${id}:${display}`,
      },
      db,
    );

    const row = getChallengeById(id, db)!;
    expect(row.denied_at).toBe(deniedRow.denied_at);
    expect(row.consumed_at).toBe(deniedRow.consumed_at);
    expect(row.approved_at).toBeNull();
  });

  it('already-approved challenge → silently acked, not double-approved', async () => {
    const approvedAt = Date.now();
    const { id, display } = makeChallenge({ approvedAt });
    const query: CallbackQuery = {
      id: 'q-dupe',
      from: { id: TEST_TG_USER_ID },
      message: { message_id: 100, chat: { id: TEST_TG_USER_ID } },
      data: `vlk:${id}:${display}`,
    };
    await handleCallbackQuery(query, db);

    const row = getChallengeById(id, db)!;
    // approved_at must not change
    expect(row.approved_at).toBe(approvedAt);
  });

  it('expired challenge → silently acked, state unchanged', async () => {
    const { id, display } = makeChallenge({ expiresAt: Date.now() - 1 });
    const query: CallbackQuery = {
      id: 'q-expired',
      from: { id: TEST_TG_USER_ID },
      data: `vlk:${id}:${display}`,
    };
    await handleCallbackQuery(query, db);

    const row = getChallengeById(id, db)!;
    expect(row.approved_at).toBeNull();
    expect(row.denied_at).toBeNull();
  });

  it('non-vlk: prefix → ignored', async () => {
    const { id } = makeChallenge();
    const query: CallbackQuery = {
      id: 'q-other',
      from: { id: TEST_TG_USER_ID },
      data: `lc9:${id}:42`, // lokalcamp prefix — not ours
    };
    await handleCallbackQuery(query, db); // should not throw

    const row = getChallengeById(id, db)!;
    expect(row.approved_at).toBeNull();
  });
});

// --- Status endpoint ---

describe('GET /api/telegram/passwordless/status', () => {
  let db: ReturnType<typeof createTestDb>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createTestDb();
    app = createApp(db);
    process.env.TG_APP_TOKEN = 'test-bot-token';
    delete process.env.TG_WEBHOOK_SECRET;
    vi.stubGlobal('fetch', mockTgFetch);
    mockTgFetch.mockClear();
    insertUser(db, TEST_EMAIL);
    insertTelegramLink(db, TEST_EMAIL, TEST_TG_USER_ID);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TG_APP_TOKEN;
  });

  function makeChallenge(overrides: Partial<{
    approvedAt: number | null;
    deniedAt: number | null;
    consumedAt: number | null;
    expiresAt: number;
  }> = {}): { raw: string } {
    const { raw, hash } = generateChallengeToken();
    const id = `st-${Math.random().toString(36).slice(2)}`;
    insertChallengeRow(db, {
      id,
      tokenHash: hash,
      email: TEST_EMAIL,
      emailHash: 'eh',
      tgUserId: TEST_TG_USER_ID,
      display: 42,
      buttons: [17, 42, 83],
      expiresAt: overrides.expiresAt ?? Date.now() + 120000,
      approvedAt: overrides.approvedAt,
      deniedAt: overrides.deniedAt,
      consumedAt: overrides.consumedAt,
    });
    return { raw };
  }

  it('returns "pending" for a fresh challenge', async () => {
    const { raw } = makeChallenge();
    const res = await request(app)
      .get('/api/telegram/passwordless/status')
      .query({ challengeToken: raw });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    // Must not leak the token value in the response
    expect(JSON.stringify(res.body)).not.toContain(raw);
  });

  it('returns "approved" after a correct tap', async () => {
    const { raw } = makeChallenge({ approvedAt: Date.now() });
    const res = await request(app)
      .get('/api/telegram/passwordless/status')
      .query({ challengeToken: raw });
    expect(res.body.status).toBe('approved');
  });

  it('returns "denied" after a wrong tap', async () => {
    const { raw } = makeChallenge({ deniedAt: Date.now(), consumedAt: Date.now() });
    const res = await request(app)
      .get('/api/telegram/passwordless/status')
      .query({ challengeToken: raw });
    expect(res.body.status).toBe('denied');
  });

  it('returns "expired" for a past-TTL challenge', async () => {
    const { raw } = makeChallenge({ expiresAt: Date.now() - 1 });
    const res = await request(app)
      .get('/api/telegram/passwordless/status')
      .query({ challengeToken: raw });
    expect(res.body.status).toBe('expired');
  });
});

// --- Complete endpoint ---

describe('POST /api/telegram/passwordless/complete', () => {
  let db: ReturnType<typeof createTestDb>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createTestDb();
    app = createApp(db);
    process.env.TG_APP_TOKEN = 'test-bot-token';
    delete process.env.TG_WEBHOOK_SECRET;
    vi.stubGlobal('fetch', mockTgFetch);
    mockTgFetch.mockClear();
    insertUser(db, TEST_EMAIL);
    insertTelegramLink(db, TEST_EMAIL, TEST_TG_USER_ID);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TG_APP_TOKEN;
  });

  function makeChallenge(overrides: Partial<{
    approvedAt: number | null;
    deniedAt: number | null;
    consumedAt: number | null;
    expiresAt: number;
  }> = {}): { raw: string } {
    const { raw, hash } = generateChallengeToken();
    const id = `co-${Math.random().toString(36).slice(2)}`;
    insertChallengeRow(db, {
      id,
      tokenHash: hash,
      email: TEST_EMAIL,
      emailHash: 'eh',
      tgUserId: TEST_TG_USER_ID,
      display: 42,
      buttons: [17, 42, 83],
      expiresAt: overrides.expiresAt ?? Date.now() + 120000,
      approvedAt: overrides.approvedAt,
      deniedAt: overrides.deniedAt,
      consumedAt: overrides.consumedAt,
    });
    return { raw };
  }

  it('succeeds after approved — issues session cookie and returns email', async () => {
    const { raw } = makeChallenge({ approvedAt: Date.now() });
    const res = await request(app)
      .post('/api/telegram/passwordless/complete')
      .send({ challengeToken: raw });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.email).toBe(TEST_EMAIL.toLowerCase());
    // Session cookie must be present
    expect(responseCookieString(res)).toContain('session=');
  });

  it('fails with 400 when not yet approved', async () => {
    const { raw } = makeChallenge(); // no approvedAt
    const res = await request(app)
      .post('/api/telegram/passwordless/complete')
      .send({ challengeToken: raw });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('not approved');
    expect(responseCookieString(res)).not.toContain('session=');
  });

  it('fails with 400 when denied', async () => {
    const { raw } = makeChallenge({ deniedAt: Date.now(), consumedAt: Date.now() });
    const res = await request(app)
      .post('/api/telegram/passwordless/complete')
      .send({ challengeToken: raw });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('denied');
    expect(responseCookieString(res)).not.toContain('session=');
  });

  it('fails with 400 when expired', async () => {
    const { raw } = makeChallenge({ approvedAt: Date.now(), expiresAt: Date.now() - 1 });
    const res = await request(app)
      .post('/api/telegram/passwordless/complete')
      .send({ challengeToken: raw });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('expired');
    expect(responseCookieString(res)).not.toContain('session=');
  });

  it('is single-use — second complete returns 400 (changes!==1)', async () => {
    const { raw } = makeChallenge({ approvedAt: Date.now() });

    const first = await request(app)
      .post('/api/telegram/passwordless/complete')
      .send({ challengeToken: raw });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/telegram/passwordless/complete')
      .send({ challengeToken: raw });
    expect(second.status).toBe(400);
    expect(second.body.error).toBe('already used');
    expect(responseCookieString(second)).not.toContain('session=');
  });

  it('rejects a pre-consumed approved challenge without issuing a session', async () => {
    const { raw } = makeChallenge({ approvedAt: Date.now(), consumedAt: Date.now() });

    const res = await request(app)
      .post('/api/telegram/passwordless/complete')
      .send({ challengeToken: raw });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('already used');
    expect(responseCookieString(res)).not.toContain('session=');
    const sessionCount = db.prepare('SELECT COUNT(*) AS count FROM sessions').get() as { count: number };
    expect(sessionCount.count).toBe(0);
  });

  it('denied state wins over approved state and does not issue a session', async () => {
    const now = Date.now();
    const { raw } = makeChallenge({ approvedAt: now, deniedAt: now, consumedAt: now });

    const res = await request(app)
      .post('/api/telegram/passwordless/complete')
      .send({ challengeToken: raw });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('denied');
    expect(responseCookieString(res)).not.toContain('session=');
    const sessionCount = db.prepare('SELECT COUNT(*) AS count FROM sessions').get() as { count: number };
    expect(sessionCount.count).toBe(0);
  });
});

describe('passwordless activation endpoints', () => {
  let db: ReturnType<typeof createTestDb>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createTestDb();
    app = createApp(db);
    insertUser(db, TEST_EMAIL);
    db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(hashPassword('password123'), TEST_EMAIL);
    insertTelegramLink(db, TEST_EMAIL, TEST_TG_USER_ID);
    delete process.env.CF_TURNSTILE_SECRET;
  });

  function authedCookie(): string {
    return `session=${createSession(TEST_EMAIL, db)}`;
  }

  it('GET settings reports linked + off when not activated', async () => {
    const res = await request(app)
      .get('/api/telegram/passwordless/settings')
      .set('Cookie', authedCookie());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ linked: true, status: 'off' });
  });

  it('POST enroll creates pending enrollment + returns challenge', async () => {
    const res = await request(app)
      .post('/api/telegram/passwordless/enroll')
      .set('Cookie', authedCookie());

    expect(res.status).toBe(200);
    expect(res.body.displayNumber).toBeGreaterThanOrEqual(10);
    expect(res.body.displayNumber).toBeLessThanOrEqual(99);
    expect(res.body.challengeToken).toBeTruthy();
    expect(res.body.pollAfterMs).toBe(2000);

    const settings = await request(app)
      .get('/api/telegram/passwordless/settings')
      .set('Cookie', authedCookie());
    expect(settings.body.status).toBe('pending');
    expect(settings.body.displayNumber).toBe(res.body.displayNumber);
  });

  it('POST verify-activate requires approved enrollment challenge', async () => {
    const enroll = await request(app)
      .post('/api/telegram/passwordless/enroll')
      .set('Cookie', authedCookie());
    const token = enroll.body.challengeToken as string;
    const tokenHash = hashChallengeToken(token);
    const challenge = getChallengeByHash(tokenHash, db)!;

    const beforeApprove = await request(app)
      .post('/api/telegram/passwordless/verify-activate')
      .set('Cookie', authedCookie())
      .send({ challengeToken: token });
    expect(beforeApprove.status).toBe(400);
    expect(beforeApprove.body.error).toBe('not approved');

    db.prepare('UPDATE tg_passwordless_challenges SET approved_at = ? WHERE id = ?').run(Date.now(), challenge.id);

    const approved = await request(app)
      .post('/api/telegram/passwordless/verify-activate')
      .set('Cookie', authedCookie())
      .send({ challengeToken: token });
    expect(approved.status).toBe(200);
    expect(approved.body).toEqual({ ok: true, status: 'active' });

    const sessionCount = db.prepare('SELECT COUNT(*) AS count FROM sessions').get() as { count: number };
    expect(sessionCount.count).toBe(0);

    const settings = await request(app)
      .get('/api/telegram/passwordless/settings')
      .set('Cookie', authedCookie());
    expect(settings.body.status).toBe('active');
  });

  it('POST disable requires password and turns status off', async () => {
    setPasswordlessActive(db, TEST_EMAIL);
    const cookie = authedCookie();

    const bad = await request(app)
      .post('/api/telegram/passwordless/disable')
      .set('Cookie', cookie)
      .send({ password: 'wrong' });
    expect(bad.status).toBe(401);

    const ok = await request(app)
      .post('/api/telegram/passwordless/disable')
      .set('Cookie', cookie)
      .send({ password: 'password123' });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true, status: 'off' });

    const row = db.prepare('SELECT tg_status FROM user_passwordless_settings WHERE email = ?').get(TEST_EMAIL) as
      | { tg_status: string }
      | undefined;
    expect(row?.tg_status).toBe('off');
  });
});
