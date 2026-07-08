const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const runDir = '/home/agjrom/websites/meet-poc/plan/WK_0701/meet-voice-standardization/projcore-run-2026-07-05';
const outDir = path.join(runDir, 'validation/peer2-B1');
const localBase = 'http://localhost:4700';
const publicBase = 'https://voice.silverjrom.app';
const relayGraphql = 'https://johnnyone.peer2-353.workers.dev/graphql';
const relaySession = process.env.RELAY_SESSION || '872d483d-d986-4a3d-9486-eb59a600a55d';
const email = 'jrom@silverjrom.app';
const password = fs.readFileSync(path.resolve(process.cwd(), 'INITIAL_PASSWORD.txt'), 'utf8').trim().split(/\r?\n/).pop();
const token = process.env.PEER2_MACHINE || (() => {
  const env = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
  return env.match(/^PEER2_MACHINE=(.+)$/m)?.[1]?.trim() || '';
})();

if (!token) {
  console.error('FATAL missing PEER2_MACHINE token');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

async function gql(query, variables) {
  const res = await fetch(relayGraphql, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) console.log('GQL_ERRORS', JSON.stringify(json.errors).slice(0, 800));
  return json;
}

async function sendRelay(content) {
  const query = 'mutation($i: RelayChatMessageInput!){ sendRelayChatMessage(input:$i){ __typename } }';
  return gql(query, { i: { sessionId: relaySession, content, provider: 'codex', model: 'gpt-5.5' } });
}

async function listMessages() {
  const query = 'query($sid: ID!){ listAiMessages(sessionId:$sid){ role content createdAt } }';
  const json = await gql(query, { sid: relaySession });
  return json?.data?.listAiMessages || [];
}

async function api(pathname, options = {}, cookie = '') {
  const headers = { ...(options.headers || {}) };
  if (cookie) headers.cookie = cookie;
  if (options.body && !headers['content-type']) headers['content-type'] = 'application/json';
  const res = await fetch(`${localBase}${pathname}`, { ...options, headers });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${pathname} -> ${res.status} ${text.slice(0, 300)}`);
  return { res, json, text };
}

async function createRoom() {
  const login = await api('/api/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const cookie = (login.res.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie) throw new Error('session cookie missing');
  const title = `B1-peer2-silent-${Date.now()}`;
  const created = await api('/api/rooms', { method: 'POST', body: JSON.stringify({ title }) }, cookie);
  let room = created.json.room;
  const opened = await api(`/api/rooms/${room.id}/access`, {
    method: 'PUT',
    body: JSON.stringify({ isOpen: true, waitTimeoutMinutes: room.waitTimeoutMinutes ?? 15 }),
  }, cookie);
  room = opened.json.room;
  return { id: room.id, slug: room.slug || room.id, title: room.title, url: `/room/${room.slug || room.id}` };
}

async function hostReady(page) {
  const deadline = Date.now() + 60000;
  let last = null;
  while (Date.now() < deadline) {
    const state = await page.evaluate(async () => {
      const d = window.__meetDebug || {};
      let statsOk = false;
      try {
        const stats = await d.sfuGetStats?.();
        statsOk = !!stats && typeof stats.forEach === 'function';
      } catch {}
      return {
        statsOk,
        wsConnected: d.wsConnected === true || d.wsStatus === 'connected',
        pc: d.sfuPcStates?.() ?? null,
        peers: Array.isArray(d.peers) ? d.peers.length : null,
        body: document.body.innerText,
      };
    }).catch(() => null);
    last = state;
    if (state?.statsOk && state?.pc && state.pc.connectionState !== 'closed') return state;
    await page.waitForTimeout(800);
  }
  console.log('HOST_READY_LAST', JSON.stringify(last));
  throw new Error('host did not become SFU-ready');
}

async function admitLoop(page, guestName, done) {
  while (!done.done) {
    try {
      const toast = page.locator('.knock-toast').filter({ hasText: guestName });
      if (await toast.isVisible().catch(() => false)) {
        await toast.getByRole('button', { name: /Admit/i }).click({ timeout: 1000 }).catch(() => {});
      }
      const admit = page.getByRole('button', { name: /Admit/i });
      const n = await admit.count().catch(() => 0);
      for (let i = 0; i < n; i += 1) await admit.nth(i).click({ timeout: 1000 }).catch(() => {});
    } catch {}
    await page.waitForTimeout(700).catch(() => {});
  }
}

function peer2Prompt(roomUrl) {
  return `HARD SAFETY RULE - READ FIRST, NO EXCEPTIONS:
An agent driven on Peer2's machine must NEVER run a delete/removal command of any kind - no rm, rm -rf, del, uninstall commands, package removal, browser-profile wipes, or any operation that deletes files, applications, or data on that machine.
You are test-and-report only. Do not clean up files, uninstall, reinstall, remove browser profiles, or modify installed software. If you believe destructive cleanup is required, stop and report instead.

Task: run this exact B1 silent-microphone validation against ${roomUrl}. It writes one temporary script/result file and closes only the browser context it opens. It does not delete anything.

cat > /home/creepy/Documents/Workspace/b1-silent-validate.mjs <<'B1SCRIPT'
import fs from 'node:fs';
import { chromium } from 'playwright';

const roomUrl = process.argv[2];
const wav = '/tmp/peer2-b1-silence.wav';

function makeSilentWav(seconds = 4, sampleRate = 48000) {
  const samples = seconds * sampleRate;
  const dataBytes = samples * 2;
  const b = Buffer.alloc(44 + dataBytes);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + dataBytes, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(sampleRate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(dataBytes, 40);
  return b;
}

fs.writeFileSync(wav, makeSilentWav());
const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--use-file-for-fake-audio-capture=' + wav,
  ],
});
const ctx = await browser.newContext({ permissions: ['microphone', 'camera'] });
const page = await ctx.newPage();
const errors = [];
const logs = [];
await page.addInitScript(() => {
  window.__gUMCount = 0;
  const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    window.__gUMCount += 1;
    console.log('[peer2-b1] gUM#' + window.__gUMCount + ' ' + JSON.stringify(constraints).slice(0, 180));
    const stream = await orig(constraints);
    const track = stream.getAudioTracks()[0];
    if (track) window.__peer2Track = { id: track.id, label: track.label, readyState: track.readyState, enabled: track.enabled, muted: track.muted };
    return stream;
  };
});
page.on('console', (m) => {
  const text = m.text();
  logs.push(text);
  if (/error|TypeError|ReferenceError|uncaught|exception/i.test(text)) errors.push(text);
});
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));

await page.goto(roomUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.locator('#display-name').fill('peer2-b1-silent', { timeout: 15000 }).catch(() => {});
await page.getByRole('button', { name: 'Ask to join' }).click({ timeout: 15000 }).catch(async () => {
  await page.getByRole('button', { name: /^Join$|^Join now$/ }).click({ timeout: 5000 });
});
await page.waitForFunction(() => /IN-CALL|DEVICES|Microphone|You are/.test(document.body.innerText || ''), { timeout: 90000 }).catch(() => {});

const samples = [];
for (let i = 0; i < 10; i += 1) {
  await page.waitForTimeout(3000);
  samples.push(await page.evaluate(async () => {
    const d = window.__meetDebug || {};
    const report = await d.sfuGetStats?.();
    const audioStats = [];
    report?.forEach((s) => {
      if (s.kind === 'audio' || s.mediaType === 'audio' || s.type === 'media-source') {
        audioStats.push({
          id: s.id,
          type: s.type,
          kind: s.kind ?? null,
          mediaType: s.mediaType ?? null,
          audioLevel: typeof s.audioLevel === 'number' ? s.audioLevel : null,
          totalAudioEnergy: typeof s.totalAudioEnergy === 'number' ? s.totalAudioEnergy : null,
          totalSamplesDuration: typeof s.totalSamplesDuration === 'number' ? s.totalSamplesDuration : null,
          bytesSent: typeof s.bytesSent === 'number' ? s.bytesSent : null,
          bytesReceived: typeof s.bytesReceived === 'number' ? s.bytesReceived : null,
          packetsSent: typeof s.packetsSent === 'number' ? s.packetsSent : null,
          trackIdentifier: s.trackIdentifier ?? null,
        });
      }
    });
    const body = (document.body.innerText || '').replace(/\\s+/g, ' ').trim();
    return {
      gum: window.__gUMCount,
      track: window.__peer2Track ?? null,
      pc: d.sfuPcStates?.() ?? null,
      publish: d.sfuPublishState ?? null,
      roomState: d.roomState ?? null,
      markers: body.match(/.{0,80}(Still trying to restore your microphone|No working microphone detected|We can't detect sound from your microphone|Check your camera and audio|Audio\\/video could not start).{0,80}/gi) || [],
      audioStats,
    };
  }));
}
const result = {
  roomUrl,
  samples,
  errors,
  consoleMic: logs.filter((x) => /gUM|mic|microphone|restore|silent|sweep|warning|error/i.test(x)).slice(0, 80),
};
fs.writeFileSync('/tmp/peer2-b1-silent-result.json', JSON.stringify(result, null, 2));
console.log('PEER2-B1-SILENT-RESULT:', JSON.stringify(result));
await browser.close();
B1SCRIPT

node /home/creepy/Documents/Workspace/b1-silent-validate.mjs "${roomUrl}"
echo "PEER2-B1-SILENT-DONE"`;
}

function findResult(messages, sinceMs) {
  const recent = messages.filter((m) => new Date(m.createdAt).getTime() >= sinceMs - 5000);
  for (const msg of recent.slice().reverse()) {
    const text = msg.content || '';
    if (msg.role === 'assistant' && text.includes('PEER2-B1-SILENT-RESULT:')) {
      const marker = 'PEER2-B1-SILENT-RESULT:';
      const start = text.indexOf(marker) + marker.length;
      const rest = text.slice(start).trim();
      const end = rest.lastIndexOf('}');
      if (end >= 0) {
        try { return { result: JSON.parse(rest.slice(0, end + 1)), raw: text }; } catch {}
      }
      return { result: null, raw: text };
    }
  }
  return null;
}

(async () => {
  console.log('PEER2_ORCH_START', new Date().toISOString());
  const room = await createRoom();
  const publicRoomUrl = `${publicBase}/room/${room.id}`;
  console.log('ROOM', JSON.stringify({ room, publicRoomUrl }));

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });
  const page = await browser.newPage();
  const done = { done: false };
  try {
    await page.goto(`${localBase}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(/\/app\/rooms/, { timeout: 15000 }).catch(() => {});
    await page.goto(`${localBase}${room.url}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#display-name').fill('host-b1-peer2');
    await page.getByRole('button', { name: /^Join$|^Join now$/ }).click();
    const ready = await hostReady(page);
    console.log('HOST_READY', JSON.stringify(ready));

    const before = Date.now();
    const prompt = peer2Prompt(publicRoomUrl);
    fs.writeFileSync(path.join(outDir, 'peer2-b1-relay-prompt.md'), prompt);
    const sent = await sendRelay(prompt);
    console.log('RELAY_SENT', JSON.stringify(sent?.data?.sendRelayChatMessage || sent).slice(0, 500));

    const loop = admitLoop(page, 'peer2-b1-silent', done);
    let found = null;
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline && !found) {
      const messages = await listMessages();
      found = findResult(messages, before);
      await page.waitForTimeout(1500);
    }
    done.done = true;
    await loop.catch(() => {});

    const messages = await listMessages();
    fs.writeFileSync(path.join(outDir, 'peer2-relay-last-messages.json'), JSON.stringify(messages.slice(-12).map((m) => ({
      role: m.role,
      createdAt: m.createdAt,
      content: (m.content || '').slice(0, 6000),
    })), null, 2));

    const hostFinal = await page.evaluate(async () => {
      const d = window.__meetDebug || {};
      const stats = await d.sfuGetStats?.();
      const audio = [];
      stats?.forEach((s) => {
        if (s.kind === 'audio' || s.mediaType === 'audio' || s.type === 'media-source') {
          audio.push({
            id: s.id,
            type: s.type,
            kind: s.kind ?? null,
            mediaType: s.mediaType ?? null,
            audioLevel: typeof s.audioLevel === 'number' ? s.audioLevel : null,
            totalAudioEnergy: typeof s.totalAudioEnergy === 'number' ? s.totalAudioEnergy : null,
            bytesSent: typeof s.bytesSent === 'number' ? s.bytesSent : null,
            bytesReceived: typeof s.bytesReceived === 'number' ? s.bytesReceived : null,
          });
        }
      });
      return {
        pc: d.sfuPcStates?.() ?? null,
        peers: Array.isArray(d.peers) ? d.peers.map((p) => ({ name: p.name, state: p.state, audioReadyState: p.audioReadyState })) : null,
        audio,
      };
    });
    fs.writeFileSync(path.join(outDir, 'peer2-host-final.json'), JSON.stringify(hostFinal, null, 2));
    if (found?.result) fs.writeFileSync(path.join(outDir, 'peer2-b1-silent-result.json'), JSON.stringify(found.result, null, 2));
    console.log('PEER2_FOUND', found ? 'yes' : 'no');
    if (found?.result) console.log('PEER2_RESULT_SUMMARY', JSON.stringify({
      samples: found.result.samples?.length,
      firstMarkers: found.result.samples?.[0]?.markers,
      lastMarkers: found.result.samples?.at?.(-1)?.markers,
      firstPc: found.result.samples?.[0]?.pc,
      lastGum: found.result.samples?.at?.(-1)?.gum,
      errors: found.result.errors,
    }));
    console.log('HOST_FINAL', JSON.stringify(hostFinal));
    if (!found?.result) process.exitCode = 1;
  } finally {
    done.done = true;
    await browser.close().catch(() => {});
  }
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
