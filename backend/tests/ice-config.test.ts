import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/server.js';
import { getIceServersFromEnv } from '../src/modules/ice-config/index.js';
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
];

describe('ice config API', () => {
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
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

  it('DR-5 has a non-blocking Cloudflare minted credential seam', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    process.env.MEET_CLOUDFLARE_TURN_TOKEN = 'not-a-real-token';
    process.env.MEET_CLOUDFLARE_TURN_SERVICE_ID = 'service-id';

    const servers = await getIceServersFromEnv();

    expect(servers).toEqual([{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Cloudflare TURN env present'));
  });
});
