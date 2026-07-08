const { chromium } = require('playwright');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const localBase = 'http://localhost:4700';
const publicBase = 'https://voice.silverjrom.app';
const email = 'jrom@silverjrom.app';
const password = fs.readFileSync(path.resolve(process.cwd(), 'INITIAL_PASSWORD.txt'), 'utf8').trim().split(/\r?\n/).pop();
const remoteHost = 'silverjrom@192.168.254.123';
const remoteScriptLocal = path.resolve(__dirname, 'dev-b1-stats-probe.cjs');
const remoteScriptPath = '/tmp/dev-b1-stats-probe.cjs';

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
  const title = `B1-remote-silent-${Date.now()}`;
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
    url: `/room/${room.slug || room.id}`,
  };
}

async function hostReady(page) {
  const deadline = Date.now() + 45000;
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
        body: document.body.innerText,
        statsOk,
        wsConnected: d.wsConnected === true || d.wsStatus === 'connected',
        pc: d.sfuPcStates?.() ?? null,
        peers: Array.isArray(d.peers) ? d.peers.length : null,
        url: location.href,
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
      const exactToast = page.locator('.knock-toast').filter({ hasText: guestName });
      if (await exactToast.isVisible().catch(() => false)) {
        await exactToast.getByRole('button', { name: /Admit/i }).click({ timeout: 1000 }).catch(() => {});
      }
      const admit = page.getByRole('button', { name: /Admit/i });
      const n = await admit.count().catch(() => 0);
      for (let i = 0; i < n; i += 1) await admit.nth(i).click({ timeout: 1000 }).catch(() => {});
    } catch {}
    await page.waitForTimeout(700).catch(() => {});
  }
}

function runRemote(roomUrl) {
  const scp = spawnSync('scp', ['-q', remoteScriptLocal, `${remoteHost}:${remoteScriptPath}`], { encoding: 'utf8' });
  if (scp.status !== 0) throw new Error(`scp failed: ${scp.stderr || scp.stdout}`);
  const cmd = [
    'NODE_PATH=/home/silverjrom/node_modules',
    'B1_ROOM_URL=' + JSON.stringify(roomUrl),
    'B1_DISPLAY_NAME=dev-b1-silent-remote',
    'timeout 240 xvfb-run -a node',
    remoteScriptPath,
  ].join(' ');
  return new Promise((resolve) => {
    const ssh = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', remoteHost, cmd], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => ssh.kill('SIGTERM'), 260000);
    ssh.stdout.on('data', (buf) => { stdout += String(buf); });
    ssh.stderr.on('data', (buf) => { stderr += String(buf); });
    ssh.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

(async () => {
  console.log('HOST_REMOTE_START', new Date().toISOString());
  const room = await createRoom();
  const publicRoomUrl = `${publicBase}/room/${room.id}`;
  console.log('ROOM', JSON.stringify({ room, publicRoomUrl }));

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
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
    await page.locator('#display-name').fill('host-b1-remote');
    await page.getByRole('button', { name: /^Join$|^Join now$/ }).click();
    const ready = await hostReady(page);
    console.log('HOST_READY', JSON.stringify(ready));

    const loop = admitLoop(page, 'dev-b1-silent-remote', done);
    await page.waitForTimeout(1000);
    const remote = await runRemote(publicRoomUrl);
    done.done = true;
    await loop.catch(() => {});
    console.log('REMOTE_STATUS', remote.status);
    console.log('REMOTE_STDOUT_BEGIN');
    console.log(remote.stdout);
    console.log('REMOTE_STDOUT_END');
    if (remote.stderr) {
      console.log('REMOTE_STDERR_BEGIN');
      console.log(remote.stderr);
      console.log('REMOTE_STDERR_END');
    }

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
    console.log('HOST_FINAL', JSON.stringify(hostFinal));
    if (remote.status !== 0) process.exitCode = 1;
  } finally {
    done.done = true;
    await browser.close().catch(() => {});
  }
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
