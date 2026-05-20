import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/server.js';
import { clearIceConfigCacheForTests, getIceServersFromEnv } from '../src/modules/ice-config/index.js';
import { createTestDb } from './helpers.js';

const ENV_KEYS = [
  'MEET_TURN_URLS',
  'TURN_URLS',
  'MEET_TURN_USERNAME',
  'TURN_USERNAME',
  'MEET_TURN_CREDENTIAL',
  'TURN_CREDENTIAL',
  'MEET_CLOUDFLARE_TURN_TOKEN',
  'CLOUDFLARE_TURN_TOKEN',
  'MEET_CLOUDFLARE_TURN_SERVICE_ID',
  'CLOUDFLARE_TURN_SERVICE_ID',
  'TURN_ID',
  'TURN_API_Key',
];

describe('ice config API', () => {
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    clearIceConfigCacheForTests();
    vi.restoreAllMocks();
  });

  it('DR-5 returns STUN-only by default', async () => {
    for (const key of ENV_KEYS) delete process.env[key];

    const res = await request(createApp(createTestDb())).get('/api/ice-config').expect(200);

    expect(res.body).toEqual({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
    });
  });

  it('DR-5 includes static long-term TURN credentials from env', async () => {
    process.env.MEET_TURN_URLS = 'turn:relay.example.com:3478,turns:relay.example.com:5349';
    process.env.MEET_TURN_USERNAME = 'metered-user';
    process.env.MEET_TURN_CREDENTIAL = 'metered-secret';

    const res = await request(createApp(createTestDb())).get('/api/ice-config').expect(200);

    expect(res.body.iceServers).toContainEqual({
      urls: ['turn:relay.example.com:3478', 'turns:relay.example.com:5349'],
      username: 'metered-user',
      credential: 'metered-secret',
    });
  });

  it('DR-5 ignores incomplete static TURN env instead of leaking partial config', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    process.env.MEET_TURN_URLS = 'turn:relay.example.com:3478';
    process.env.MEET_TURN_USERNAME = 'metered-user';

    const servers = await getIceServersFromEnv();

    expect(servers).toEqual([{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ignoring incomplete static TURN env'));
  });

  it('DR-5 mints Cloudflare TURN credentials from JROM env names and merges them with STUN', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        iceServers: {
          urls: [
            'stun:stun.cloudflare.com:3478',
            'turn:turn.cloudflare.com:3478?transport=udp',
            'turn:turn.cloudflare.com:3478?transport=tcp',
            'turns:turn.cloudflare.com:5349?transport=tcp',
          ],
          username: 'minted-user',
          credential: 'minted-secret',
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    process.env.TURN_ID = 'cloudflare-key-id';
    process.env.TURN_API_Key = 'cloudflare-token';

    const res = await request(createApp(createTestDb())).get('/api/ice-config').expect(200);

    expect(fetchMock).toHaveBeenCalledWith('https://rtc.live.cloudflare.com/v1/turn/keys/cloudflare-key-id/credentials/generate', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer cloudflare-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: 86400 }),
    });
    expect(res.body.iceServers).toEqual([
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: [
          'stun:stun.cloudflare.com:3478',
          'turn:turn.cloudflare.com:3478?transport=udp',
          'turn:turn.cloudflare.com:3478?transport=tcp',
          'turns:turn.cloudflare.com:5349?transport=tcp',
        ],
        username: 'minted-user',
        credential: 'minted-secret',
      },
    ]);
  });

  it('DR-5 caches Cloudflare minted credentials between requests', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        iceServers: {
          urls: ['turn:turn.cloudflare.com:3478?transport=udp'],
          username: 'cached-user',
          credential: 'cached-secret',
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    process.env.TURN_ID = 'cloudflare-key-id';
    process.env.TURN_API_Key = 'cloudflare-token';

    await getIceServersFromEnv();
    await getIceServersFromEnv();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('DR-5 falls back to STUN-only when Cloudflare mint fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );
    process.env.TURN_ID = 'cloudflare-key-id';
    process.env.TURN_API_Key = 'cloudflare-token';

    const servers = await getIceServersFromEnv();

    expect(servers).toEqual([{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Cloudflare TURN mint failed with status 500'));
  });

  it('DR-5 falls back to STUN-only when Cloudflare mint throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    process.env.TURN_ID = 'cloudflare-key-id';
    process.env.TURN_API_Key = 'cloudflare-token';

    const servers = await getIceServersFromEnv();

    expect(servers).toEqual([{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Cloudflare TURN mint request failed'));
  });
});
