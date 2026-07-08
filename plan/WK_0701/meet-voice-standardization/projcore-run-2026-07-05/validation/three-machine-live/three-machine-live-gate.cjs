const { chromium } = require('playwright');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const localBase = 'http://localhost:4700';
const publicBase = 'https://voice.silverjrom.app';
const email = 'jrom@silverjrom.app';
const password = fs.readFileSync(path.resolve(process.cwd(), 'INITIAL_PASSWORD.txt'), 'utf8').trim().split(/\r?\n/).pop();
const outDir = __dirname;
const remoteClientLocal = path.join(outDir, 'remote-live-client.cjs');
const remoteClientPath = '/tmp/meet-poc-remote-live-client.cjs';
const sgHost = 'silverjrom@silverjrom.com';
const devHost = 'silverjrom@192.168.254.123';
const hostTone = path.resolve(process.cwd(), 'e2e/fixtures/audio/tone-440.wav');
const sgTone = path.resolve(process.cwd(), 'e2e/fixtures/audio/tone-660.wav');
const devTone = path.resolve(process.cwd(), 'e2e/fixtures/audio/tone-940.wav');
const hostName = `host-local-${Date.now()}`;
const sgName = `sg-remote-${Date.now()}`;
const devName = `dev-remote-${Date.now()}`;

function run(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', ...options });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${res.status}): ${res.stderr || res.stdout}`);
  }
  return res;
}

async function api(pathname, options = {}, cookie = '') {
  const headers = { ...(options.headers || {}) };
  if (cookie) headers.cookie = cookie;
  if (options.body && !headers['content-type']) headers['content-type'] = 'application/json';
  const res = await fetch(`${localBase}${pathname}`, { ...options, headers });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${pathname} -> ${res.status} ${text.slice(0, 300)}`);
  return { res, text, json };
}

async function createRoom() {
  const login = await api('/api/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const cookie = (login.res.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie) throw new Error('session cookie missing from API login');
  const title = `3-machine-live-${Date.now()}`;
  const created = await api('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ title }),
  }, cookie);
  let room = created.json.room;
  const opened = await api(`/api/rooms/${room.id}/access`, {
    method: 'PUT',
    body: JSON.stringify({ isOpen: true, waitTimeoutMinutes: room.waitTimeoutMinutes ?? 15 }),
  }, cookie);
  room = opened.json.room;
  return {
    id: room.id,
    slug: room.slug || room.id,
    title: room.title,
    localUrl: `${localBase}/room/${room.slug || room.id}`,
    publicUrl: `${publicBase}/room/${room.slug || room.id}`,
  };
}

async function loginHost(page) {
  await page.goto(`${localBase}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/app\/rooms/, { timeout: 15000 }).catch(() => {});
}

async function joinHost(page, room) {
  await page.goto(room.localUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await page.locator('#display-name').fill(hostName).catch(() => {});
  await page.getByRole('button', { name: /^Join$|^Join now$/ }).click({ timeout: 5000 }).catch(async () => {
    await page.locator('button:has-text("Join")').first().click({ timeout: 5000 });
  });
}

async function hostReady(page) {
  const deadline = Date.now() + 50000;
  let last = null;
  while (Date.now() < deadline) {
    const state = await readSnapshot(page).catch(() => null);
    last = state;
    const pcOk = state?.pc && state.pc.connectionState && state.pc.connectionState !== 'closed';
    const publishOk = state?.publish && /publish|connected|ready|live/i.test(JSON.stringify(state.publish));
    const outbound = summarizeAudio([], state?.audio || {}).outboundBytesDelta;
    if (pcOk || publishOk || outbound > 0) return state;
    await page.waitForTimeout(800);
  }
  throw new Error(`host did not become SFU-ready; last=${JSON.stringify(last)}`);
}

async function admitLoop(page, done) {
  while (!done.done) {
    try {
      const admit = page.getByRole('button', { name: /Admit/i });
      const count = await admit.count().catch(() => 0);
      for (let i = 0; i < count; i += 1) {
        await admit.nth(i).click({ timeout: 1000 }).catch(() => {});
      }
    } catch {}
    await page.waitForTimeout(500).catch(() => {});
  }
}

async function readSnapshot(page) {
  return page.evaluate(async () => {
    const d = window.__meetDebug || {};
    let stats = [];
    try {
      const report = await d.sfuGetStats?.();
      stats = report ? Array.from(report.values()).map((x) => ({ ...x })) : [];
    } catch {}
    const body = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      url: location.href,
      title: document.title,
      bodySample: body.slice(0, 500),
      pc: d.sfuPcStates?.() ?? null,
      publish: d.sfuPublishState ?? null,
      peers: Array.isArray(d.peers)
        ? d.peers.map((p) => ({
            name: p.name,
            state: p.state,
            audioReadyState: p.audioReadyState,
            connectionQuality: p.connectionQuality,
          }))
        : null,
      remoteStreamCount: d.sfuRemoteStreams?.size ?? null,
      wsConnected: d.wsConnected ?? null,
      wsStatus: d.wsStatus ?? null,
      micWorking: d.micWorking ?? null,
      stats,
    };
  }).then((snap) => ({ ...snap, audio: audioStatsFromReport(snap.stats), stats: undefined }));
}

function audioStatsFromReport(stats) {
  const rows = [];
  for (const item of stats || []) {
    if (!item || typeof item !== 'object') continue;
    const isAudio =
      item.kind === 'audio' ||
      item.mediaType === 'audio' ||
      item.type === 'media-source' ||
      item.type === 'track';
    if (!isAudio) continue;
    rows.push({
      id: item.id,
      type: item.type,
      kind: item.kind ?? null,
      mediaType: item.mediaType ?? null,
      audioLevel: typeof item.audioLevel === 'number' ? item.audioLevel : null,
      totalAudioEnergy: typeof item.totalAudioEnergy === 'number' ? item.totalAudioEnergy : null,
      totalSamplesDuration: typeof item.totalSamplesDuration === 'number' ? item.totalSamplesDuration : null,
      bytesSent: typeof item.bytesSent === 'number' ? item.bytesSent : null,
      packetsSent: typeof item.packetsSent === 'number' ? item.packetsSent : null,
      bytesReceived: typeof item.bytesReceived === 'number' ? item.bytesReceived : null,
      packetsReceived: typeof item.packetsReceived === 'number' ? item.packetsReceived : null,
      concealedSamples: typeof item.concealedSamples === 'number' ? item.concealedSamples : null,
      jitter: typeof item.jitter === 'number' ? item.jitter : null,
      trackIdentifier: item.trackIdentifier ?? null,
    });
  }
  return rows;
}

function summarizeAudio(beforeAudio, afterAudio) {
  const keyOf = (s) => `${s.type}:${s.kind || s.mediaType || ''}:${s.id}`;
  const beforeMap = new Map((beforeAudio || []).map((s) => [keyOf(s), s]));
  let outboundBytesDelta = 0;
  let outboundPacketsDelta = 0;
  let inboundBytesDelta = 0;
  let inboundPacketsDelta = 0;
  let mediaEnergyDelta = 0;
  let mediaDurationDelta = 0;
  let inboundCount = 0;
  let outboundCount = 0;
  for (const row of afterAudio || []) {
    const prev = beforeMap.get(keyOf(row)) || {};
    if (row.type === 'outbound-rtp') {
      outboundCount += 1;
      outboundBytesDelta += Math.max(0, (row.bytesSent || 0) - (prev.bytesSent || 0));
      outboundPacketsDelta += Math.max(0, (row.packetsSent || 0) - (prev.packetsSent || 0));
    }
    if (row.type === 'inbound-rtp') {
      inboundCount += 1;
      inboundBytesDelta += Math.max(0, (row.bytesReceived || 0) - (prev.bytesReceived || 0));
      inboundPacketsDelta += Math.max(0, (row.packetsReceived || 0) - (prev.packetsReceived || 0));
    }
    if (row.type === 'media-source') {
      mediaEnergyDelta += Math.max(0, (row.totalAudioEnergy || 0) - (prev.totalAudioEnergy || 0));
      mediaDurationDelta += Math.max(0, (row.totalSamplesDuration || 0) - (prev.totalSamplesDuration || 0));
    }
  }
  return { outboundCount, inboundCount, outboundBytesDelta, outboundPacketsDelta, inboundBytesDelta, inboundPacketsDelta, mediaEnergyDelta, mediaDurationDelta };
}

function prepareRemote(host, audioLocal, audioRemote) {
  run('scp', ['-q', remoteClientLocal, `${host}:${remoteClientPath}`]);
  run('scp', ['-q', audioLocal, `${host}:${audioRemote}`]);
}

function spawnRemote({ label, host, roomUrl, displayName, audioRemote, sg }) {
  const env = [
    `ROOM_URL=${JSON.stringify(roomUrl)}`,
    `DISPLAY_NAME=${JSON.stringify(displayName)}`,
    `AUDIO_WAV=${JSON.stringify(audioRemote)}`,
    'OBSERVE_MS=115000',
    'SAMPLE_MS=5000',
  ];
  if (sg) {
    env.push('PLAYWRIGHT_MODULE=$HOME/meet-poc-test-client/node_modules/playwright-core');
    env.push('PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium-headless-shell');
  } else {
    env.push('NODE_PATH=/home/silverjrom/node_modules');
  }
  const cmd = `${env.join(' ')} timeout 160 node ${remoteClientPath}`;
  const child = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, cmd], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (buf) => { stdout += String(buf); });
  child.stderr.on('data', (buf) => { stderr += String(buf); });
  return {
    label,
    child,
    done: new Promise((resolve) => {
      const timer = setTimeout(() => child.kill('SIGTERM'), 180000);
      child.on('close', (status) => {
        clearTimeout(timer);
        resolve({ label, status, stdout, stderr });
      });
    }),
  };
}

function parseRemoteResult(remote) {
  const text = remote.stdout || '';
  const marker = text.indexOf('"marker": "REMOTE_LIVE_CLIENT_DONE"');
  if (marker < 0) return { parseError: 'marker-not-found', rawTail: text.slice(-4000) };
  const start = text.lastIndexOf('{', marker);
  if (start < 0) return { parseError: 'json-start-not-found', rawTail: text.slice(-4000) };
  try {
    return JSON.parse(text.slice(start));
  } catch (error) {
    return { parseError: error.message, rawTail: text.slice(-4000) };
  }
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const startedAt = new Date().toISOString();
  console.log('THREE_MACHINE_LIVE_GATE_START', startedAt);
  const room = await createRoom();
  console.log('ROOM', JSON.stringify(room));

  const sgAudio = '/tmp/meet-poc-tone-660.wav';
  const devAudio = '/tmp/meet-poc-tone-940.wav';
  prepareRemote(sgHost, sgTone, sgAudio);
  prepareRemote(devHost, devTone, devAudio);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${hostTone}`,
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  });
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  const consoleLines = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (/error|fail|exception|uncaught|webrtc|sfu|mic|audio|join|admit/i.test(text)) {
      consoleLines.push({ type: msg.type(), text: text.slice(0, 500) });
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const done = { done: false };
  let admitTask = null;
  try {
    await loginHost(page);
    await joinHost(page, room);
    const ready = await hostReady(page);
    console.log('HOST_READY', JSON.stringify(ready));

    admitTask = admitLoop(page, done);
    const sg = spawnRemote({ label: 'sg', host: sgHost, roomUrl: room.publicUrl, displayName: sgName, audioRemote: sgAudio, sg: true });
    const dev = spawnRemote({ label: 'dev_machine', host: devHost, roomUrl: room.publicUrl, displayName: devName, audioRemote: devAudio, sg: false });

    const hostBefore = await readSnapshot(page);
    const samples = [];
    for (let i = 0; i < 12; i += 1) {
      await page.waitForTimeout(5000);
      const snap = await readSnapshot(page);
      samples.push({
        tMs: (i + 1) * 5000,
        pc: snap.pc,
        publish: snap.publish,
        peerCount: Array.isArray(snap.peers) ? snap.peers.length : null,
        peers: snap.peers,
        remoteStreamCount: snap.remoteStreamCount,
        audio: snap.audio,
        bodySample: snap.bodySample.slice(0, 240),
      });
    }

    // Capture the host while both remote clients are still in their longer observation window.
    const hostAfter = await readSnapshot(page);
    const hostSummary = summarizeAudio(hostBefore.audio, hostAfter.audio);
    const remotes = await Promise.all([sg.done, dev.done]);
    done.done = true;
    await admitTask.catch(() => {});
    const parsedRemotes = remotes.map((r) => ({ ...r, parsed: parseRemoteResult(r) }));
    const result = {
      marker: 'THREE_MACHINE_LIVE_GATE_DONE',
      startedAt,
      finishedAt: new Date().toISOString(),
      room,
      participants: { hostName, sgName, devName },
      host: {
        before: hostBefore,
        after: hostAfter,
        samples,
        summary: hostSummary,
        consoleLines,
        pageErrors,
      },
      remotes: parsedRemotes.map((r) => ({
        label: r.label,
        status: r.status,
        stderrTail: (r.stderr || '').slice(-3000),
        parsed: r.parsed,
      })),
    };

    result.pass =
      hostSummary.outboundBytesDelta > 0 &&
      hostSummary.inboundBytesDelta > 0 &&
      hostAfter.remoteStreamCount >= 2 &&
      !pageErrors.length &&
      parsedRemotes.every((r) => r.status === 0 && r.parsed && r.parsed.pass === true);

    const outPath = path.join(outDir, `three-machine-result-${Date.now()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
    fs.writeFileSync(path.join(outDir, 'three-machine-latest.json'), JSON.stringify(result, null, 2));
    console.log('RESULT_PATH', outPath);
    console.log(JSON.stringify({
      marker: result.marker,
      pass: result.pass,
      room: result.room,
      hostSummary,
      remoteSummaries: result.remotes.map((r) => ({ label: r.label, status: r.status, pass: r.parsed?.pass, summary: r.parsed?.summary, parseError: r.parsed?.parseError })),
    }, null, 2));
    if (!result.pass) process.exitCode = 1;
  } finally {
    done.done = true;
    await admitTask?.catch(() => {});
    await browser.close().catch(() => {});
  }
})().catch((error) => {
  console.error('THREE_MACHINE_LIVE_GATE_FATAL', error);
  process.exit(1);
});
