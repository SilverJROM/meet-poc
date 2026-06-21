#!/usr/bin/env node
/**
 * r9-recorder-host.mjs — controlled recorder host for the R9 named-transcription proof.
 *
 * Logs in as owner, joins AGENTROOM as host, waits until it sees >=N remote audio
 * publishers (Alice/Bob/Carol/Dave), clicks the in-app Record button to START,
 * lets cross-talk run for RECORD_MS, then clicks Record again to STOP — which runs
 * the real toggleRecording() path including uploadPerUser() so the backend writes a
 * separate per-user .webm per participant tagged by displayName.
 *
 * Usage: node r9-recorder-host.mjs [--peers 4] [--record-ms 35000]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const WANT_PEERS = parseInt(arg('--peers', '4'), 10);
const RECORD_MS = parseInt(arg('--record-ms', '35000'), 10);

const FLAGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
];
const TONE = path.resolve(REPO_ROOT, 'e2e/fixtures/audio/tone-660.wav'); // recorder host needs *some* mic; tone is fine
const LOGIN_URL = 'http://localhost:4700/login';
const EMAIL = 'jrom@silverjrom.app';
const PW = 'Admin@1234';

const AGENT = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'AGENTROOM.json'), 'utf8'));
const ROOM_ID = AGENT.id;
const ROOM_URL = `http://localhost:4700/room/${ROOM_ID}`;

const log = (...a) => console.log('[R9REC]', ...a);

async function countRemoteAudio(page) {
  return page.evaluate(async () => {
    const d = window.__meetDebug || {};
    const streams = d.sfuRemoteStreams;
    if (!streams) return 0;
    let stats = null;
    try { if (d.sfuGetStats) stats = await d.sfuGetStats(); } catch {}
    const byTrack = {};
    if (stats) stats.forEach(s => {
      if (s.type === 'inbound-rtp' && s.kind === 'audio' && s.trackIdentifier) {
        byTrack[s.trackIdentifier] = Math.max(byTrack[s.trackIdentifier] || 0, s.bytesReceived || 0);
      }
    });
    let act = 0;
    for (const [, st] of streams) {
      const t = st.getAudioTracks && st.getAudioTracks()[0];
      if (t && t.readyState === 'live') {
        if (Object.keys(byTrack).length === 0 || (byTrack[t.id] || 0) > 0) act++;
      }
    }
    return act;
  }).catch(() => 0);
}

async function main() {
  const launchArgs = [...FLAGS];
  if (fs.existsSync(TONE)) launchArgs.push(`--use-file-for-fake-audio-capture=${TONE}`);
  const browser = await chromium.launch({ headless: true, args: launchArgs });
  const context = await browser.newContext({ permissions: ['microphone', 'camera'] });
  const page = await context.newPage();
  page.on('console', m => { const t = m.text(); if (/record|per-user|upload|Recording/i.test(t)) log('PAGE>', t.slice(0, 200)); });

  // Login
  await page.goto(LOGIN_URL).catch(() => {});
  await page.locator('input[type="email"], #login-email').fill(EMAIL).catch(() => {});
  await page.locator('input[type="password"], #login-password').fill(PW).catch(() => {});
  await page.getByRole('button', { name: /Sign in|Log in/i }).click().catch(() => {});
  await page.waitForTimeout(1200);
  log('login done');

  // Join as host — mirror persistent-agent-host.mjs proven preflight (speaker test + Yes + confirm)
  await page.goto(ROOM_URL).catch(() => {});
  await page.waitForTimeout(600);
  const configure = page.getByRole('button', { name: /Test \/ configure devices|Hide device test|Test|configure/i });
  if (await configure.count() > 0) { await configure.first().click().catch(() => {}); }
  await page.waitForTimeout(400);
  const testSpk = page.getByRole('button', { name: 'Test speaker' });
  if (await testSpk.count() > 0) { await testSpk.first().click().catch(() => {}); await page.waitForTimeout(1100); }
  const yes = page.locator('button.speaker-confirm-yes, button:has-text("Yes")').first();
  if (await yes.count() > 0 && await yes.isVisible().catch(() => false)) { await yes.click().catch(() => {}); await page.waitForTimeout(350); }
  const confirmBtn = page.getByRole('button', { name: /Confirm — everything works|Check mic and speaker/i });
  if (await confirmBtn.count() > 0) { await confirmBtn.first().click().catch(() => {}); }
  await page.waitForTimeout(400);

  const nameInput = page.locator('#display-name');
  if (await nameInput.count() > 0) await nameInput.fill('Recorder').catch(() => {});
  await page.getByRole('button', { name: 'Join' }).click().catch(() => {});
  await page.waitForTimeout(1500);

  // wait for signaling + actual in-call UI (record button present = entered the call view)
  for (let i = 0; i < 50; i++) {
    const st = await page.evaluate(() => {
      const d = window.__meetDebug || {};
      const wsOk = (d.wsStatus === 'connected' || d.wsConnected === true) && !!(d.myClientId || d.clientId);
      const recBtn = !!document.querySelector('button[aria-label="Record"],button[aria-label="Stop recording"]');
      return { wsOk, recBtn, streams: (d.sfuRemoteStreams ? d.sfuRemoteStreams.size : 0) };
    }).catch(() => ({ wsOk: false, recBtn: false, streams: 0 }));
    if (st.wsOk && st.recBtn) { log('IN-CALL UI ready streams=', st.streams); break; }
    if (i % 6 === 0) log('joining... ', JSON.stringify(st));
    await page.waitForTimeout(500);
  }

  // Wait until we see WANT_PEERS remote audio publishers
  const peerDl = Date.now() + 90000;
  let peers = 0;
  while (Date.now() < peerDl) {
    peers = await countRemoteAudio(page);
    log('remote audio publishers =', peers);
    if (peers >= WANT_PEERS) break;
    await page.waitForTimeout(2500);
  }
  log('proceeding to record with peers=', peers);

  // Dump participant roster (for displayName mapping sanity)
  const roster = await page.evaluate(() => {
    const d = window.__meetDebug || {};
    return (d.participants || d.peers || []).map(p => ({ id: p.clientId || p.id, name: p.displayName || p.name }));
  }).catch(() => []);
  log('roster=', JSON.stringify(roster));

  // Click Record (start) — aria-label is exactly "Record" when not recording
  const recBtn = page.locator('button[aria-label="Record"]');
  if (await recBtn.count() > 0) {
    await recBtn.first().click({ force: true }).catch(() => {});
    log('clicked RECORD (start)');
  } else {
    log('WARN: Record button not found; trying any record aria');
    await page.locator('button[aria-label*="record" i]').first().click({ force: true }).catch(() => {});
  }
  await page.waitForTimeout(1500);
  const recOn = await page.evaluate(() => !!(window.__meetDebug && window.__meetDebug.isRecording))
    .catch(() => null);
  log('recording active (best-effort)=', recOn, ' — letting cross-talk run', RECORD_MS, 'ms');

  await page.waitForTimeout(RECORD_MS);

  // Click Record again (stop) → triggers stop + upload + uploadPerUser
  log('stopping recording now (flushes per-user webms)');
  const stopBtn = page.locator('button[aria-label="Stop recording"]');
  if (await stopBtn.count() > 0) {
    await stopBtn.first().click({ force: true }).catch(() => {});
  } else {
    await page.locator('button[aria-label*="record" i]').first().click({ force: true }).catch(() => {});
  }
  log('clicked STOP — waiting for uploads to complete');
  await page.waitForTimeout(12000);
  log('done waiting for uploads; staying alive 5s then exit');
  await page.waitForTimeout(5000);
  await browser.close().catch(() => {});
  log('EXIT');
  process.exit(0);
}

main().catch(e => { console.error('[R9REC] fatal', e); process.exit(1); });
