import assert from 'node:assert/strict';
import {
  decideIceConfigOutcome,
  iceServersFromConfigPayload,
  iceServersHaveTurn,
  ICE_CONFIG_MAX_ATTEMPTS,
  ICE_CONFIG_RETRY_BACKOFF_MS,
} from './ice-config-utils.js';

// B16 — successful fetch uses the returned ICE config immediately.
{
  const outcome = decideIceConfigOutcome({
    fetchOk: true,
    hasUsableServers: true,
    attempt: 1,
    maxAttempts: ICE_CONFIG_MAX_ATTEMPTS,
  });
  assert.equal(outcome, 'use');
}

// B16 — transient failure retries before falling back.
{
  const first = decideIceConfigOutcome({
    fetchOk: false,
    hasUsableServers: false,
    attempt: 1,
    maxAttempts: ICE_CONFIG_MAX_ATTEMPTS,
  });
  const second = decideIceConfigOutcome({
    fetchOk: false,
    hasUsableServers: false,
    attempt: 2,
    maxAttempts: ICE_CONFIG_MAX_ATTEMPTS,
  });
  assert.equal(first, 'retry');
  assert.equal(second, 'retry');
  assert.deepEqual([...ICE_CONFIG_RETRY_BACKOFF_MS], [250, 750]);
}

// B16 — exhausted attempts surface relay-unavailable instead of silent STUN-only success.
{
  const exhausted = decideIceConfigOutcome({
    fetchOk: false,
    hasUsableServers: false,
    attempt: ICE_CONFIG_MAX_ATTEMPTS,
    maxAttempts: ICE_CONFIG_MAX_ATTEMPTS,
  });
  assert.equal(exhausted, 'relay-unavailable');
}

// B16 — malformed/empty payload is not usable and therefore retries/fails loud.
{
  const empty = iceServersFromConfigPayload({ iceServers: [] });
  assert.deepEqual(empty, []);
  assert.equal(
    decideIceConfigOutcome({
      fetchOk: true,
      hasUsableServers: empty.length > 0,
      attempt: ICE_CONFIG_MAX_ATTEMPTS,
      maxAttempts: ICE_CONFIG_MAX_ATTEMPTS,
    }),
    'relay-unavailable',
  );
}

// B16 — one mapper feeds both main and publish PCs and preserves relay over TLS 443.
{
  const payload = {
    iceServers: [
      { urls: 'stun:stun.cloudflare.com:3478' },
      {
        urls: [
          'turn:turn.cloudflare.com:3478?transport=udp',
          'turn:turn.cloudflare.com:3478?transport=tcp',
          'turns:turn.cloudflare.com:5349?transport=tcp',
        ],
        username: 'minted-user',
        credential: 'minted-secret',
      },
    ],
  };
  const mainPcIceServers = iceServersFromConfigPayload(payload);
  const publishPcIceServers = iceServersFromConfigPayload(payload);
  const turnServer = publishPcIceServers.find((server) => iceServersHaveTurn([server]));
  const turnUrls = Array.isArray(turnServer?.urls) ? turnServer?.urls : [turnServer?.urls];

  assert.deepEqual(publishPcIceServers, mainPcIceServers);
  assert.equal(iceServersHaveTurn(publishPcIceServers), true);
  assert.ok(turnUrls.includes('turns:turn.cloudflare.com:443?transport=tcp'));
}

console.log('ice-config: all assertions passed');
