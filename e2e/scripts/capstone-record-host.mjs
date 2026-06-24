/*
 * capstone-record-host.mjs — recorder host for the NEW UI (Record moved into the "More" menu).
 * Logs in as owner, joins AGENTROOM as host, waits for >=1 remote publisher (Peer2/US),
 * opens More → clicks "Record meeting", records RECORD_MS, then ENDS THE CALL WHILE RECORDING
 * (Leave call → Close room) to exercise the B5 flushRecordingForExit() fix on a real PH<->US call.
 *
 * Usage: node e2e/scripts/capstone-record-host.mjs [--peers 1] [--record-ms 180000]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const WANT_PEERS = parseInt(arg('--peers', '1'), 10);
const RECORD_MS = parseInt(arg('--record-ms', '180000'), 10);
const FLAGS = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'];
const TONE = path.resolve(REPO_ROOT, 'e2e/fixtures/audio/tone-660.wav');
const LOGIN_URL = 'http://localhost:4700/login';
const EMAIL = 'jrom@silverjrom.app';
const PW = 'Admin@1234';
const AGENT = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'AGENTROOM.json'), 'utf8'));
const ROOM_URL = `http://localhost:4700/room/${AGENT.id}`;
const log = (...a) => console.log('[CAPREC]', ...a);

async function remoteAudioCount(page) {
  return page.evaluate(() => {
    const d = window.__meetDebug || {};
    const s = d.sfuRemoteStreams;
    if (!s) return 0;
    let n = 0;
    for (const [, st] of s) { const t = st.getAudioTracks && st.getAudioTracks()[0]; if (t && t.readyState === 'live') n++; }
    return n;
  }).catch(() => 0);
}

async function main() {
  const launchArgs = [...FLAGS];
  if (fs.existsSync(TONE)) launchArgs.push(`--use-file-for-fake-audio-capture=${TONE}`);
  const browser = await chromium.launch({ headless: true, args: launchArgs });
  const context = await browser.newContext({ permissions: ['microphone', 'camera'] });
  const page = await context.newPage();
  page.on('console', m => { const t = m.text(); if (/record|per-user|upload|Recording|saved|close-room/i.test(t)) log('PAGE>', t.slice(0, 200)); });

  // Login
  await page.goto(LOGIN_URL).catch(() => {});
  await page.locator('input[type="email"], #login-email').fill(EMAIL).catch(() => {});
  await page.locator('input[type="password"], #login-password').fill(PW).catch(() => {});
  // Click the actual password submit button (type=submit), NOT the new "Sign in with Telegram" icon
  // which also matches a /Sign in/ name. Fall back to pressing Enter to submit the form.
  await page.locator('button[type="submit"].submit-btn, button[type="submit"]').first().click().catch(() => {});
  await page.locator('#login-password').press('Enter').catch(() => {});
  await page.waitForTimeout(1800);
  log('login submitted');

  // Join + preflight gate
  await page.goto(ROOM_URL).catch(() => {});
  await page.waitForTimeout(700);
  const configure = page.getByRole('button', { name: /Test \/ configure devices|Test|configure/i });
  if (await configure.count() > 0) { await configure.first().click().catch(() => {}); await page.waitForTimeout(400); }
  const testSpk = page.getByRole('button', { name: 'Test speaker' });
  if (await testSpk.count() > 0) { await testSpk.first().click().catch(() => {}); await page.waitForTimeout(1100); }
  const yes = page.locator('button.speaker-confirm-yes, button:has-text("Yes")').first();
  if (await yes.count() > 0 && await yes.isVisible().catch(() => false)) { await yes.click().catch(() => {}); await page.waitForTimeout(350); }
  const confirmBtn = page.getByRole('button', { name: /Confirm — everything works|Check mic and speaker/i });
  if (await confirmBtn.count() > 0) { await confirmBtn.first().click().catch(() => {}); await page.waitForTimeout(400); }
  const nameInput = page.locator('#display-name');
  if (await nameInput.count() > 0) await nameInput.fill('Recorder').catch(() => {});
  await page.getByRole('button', { name: 'Join' }).click().catch(() => {});
  await page.waitForTimeout(1500);

  // Wait for in-call (Leave call button present in the new pill UI)
  for (let i = 0; i < 60; i++) {
    const inCall = await page.locator('button[aria-label="Leave call"]').count().catch(() => 0);
    if (inCall > 0) { log('IN-CALL (Leave button present)'); break; }
    if (i % 6 === 0) log('joining...');
    await page.waitForTimeout(500);
  }

  // Wait for WANT_PEERS remote publishers (Peer2)
  for (let i = 0; i < 120; i++) {
    const n = await remoteAudioCount(page);
    if (i % 5 === 0) log('remote audio publishers =', n);
    if (n >= WANT_PEERS) { log('peers ready =', n); break; }
    await page.waitForTimeout(1000);
  }

  // START recording: open "More controls" → click "Record meeting"
  await page.locator('button[aria-label="More controls"]').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(500);
  const recItem = page.getByRole('menuitem', { name: /Record meeting/i });
  if (await recItem.count() > 0) { await recItem.first().click({ force: true }).catch(() => {}); }
  else { await page.locator('button.more-item:has-text("Record")').first().click({ force: true }).catch(() => {}); }
  await page.waitForTimeout(1500);
  const recOn = await page.evaluate(() => !!(window.__meetDebug && window.__meetDebug.isRecording)).catch(() => false);
  log('record started? isRecording=', recOn);

  log(`recording for ${Math.round(RECORD_MS / 1000)}s...`);
  await page.waitForTimeout(RECORD_MS);

  // END WHILE RECORDING (B5 path): Leave call → Close room  (NO manual stop first)
  log('ending call WHILE recording (Leave call -> Close room) — exercises flushRecordingForExit');
  await page.locator('button[aria-label="Leave call"]').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(700);
  const closeRoom = page.getByRole('button', { name: /Close room/i });
  if (await closeRoom.count() > 0) { await closeRoom.first().click({ force: true }).catch(() => {}); }
  else { await page.locator('button.danger-btn').first().click({ force: true }).catch(() => {}); }
  log('clicked Close room — waiting for "Saving recording" + upload to finish');

  // Wait for upload to complete (isUploading false again, or up to 90s)
  for (let i = 0; i < 90; i++) {
    const up = await page.evaluate(() => !!(window.__meetDebug && window.__meetDebug.isUploading)).catch(() => false);
    if (i > 3 && !up) { log('upload settled'); break; }
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(4000);
  log('done; closing');
  await browser.close().catch(() => {});
  process.exit(0);
}
main().catch(e => { console.error('[CAPREC] fatal', e); process.exit(1); });
