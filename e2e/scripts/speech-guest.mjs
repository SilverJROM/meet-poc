#!/usr/bin/env node
/**
 * speech-guest.mjs — minimal join-and-play guest for R9 named-transcription proof.
 *
 * Joins AGENTROOM as a guest with a given display name, publishes a 48kHz speech WAV
 * as fake mic (--use-file-for-fake-audio-capture), and STAYS in-call so the host's
 * per-user recorder captures a separate .webm tagged by displayName.
 *
 * No tone-measurement, no record-forcing (the persistent host auto-records).
 *
 * Usage:
 *   node speech-guest.mjs --name Alice --wav /abs/path/alice-host.wav
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

const NAME = arg('--name', 'GuestX');
const WAV = path.resolve(arg('--wav', ''));
const LABEL = NAME.toUpperCase();

const FLAGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
];

const AGENT = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'AGENTROOM.json'), 'utf8'));
const ROOM_ID = AGENT.id;
const PUBLIC_URL = AGENT.publicUrl || `https://voice.silverjrom.app/room/${ROOM_ID}`;
// Use the local URL so the guest lands on the same backend the host records from.
const LOCAL_URL = `http://localhost:4700/room/${ROOM_ID}`;

async function handlePreflight(page) {
  const openBtn = page.getByRole('button', { name: /Test \/ configure devices/i });
  if (await openBtn.count() > 0 && await openBtn.first().isVisible().catch(() => false)) {
    await openBtn.first().click().catch(() => {});
    await page.waitForTimeout(400);
  }
  const confirmBtn = page.getByRole('button', { name: /Confirm — everything works|Check mic and speaker/i });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await confirmBtn.count() > 0) {
      const enabled = await confirmBtn.first().isEnabled().catch(() => false);
      if (enabled) { await confirmBtn.first().click().catch(() => {}); break; }
    }
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(300);
}

async function main() {
  if (!fs.existsSync(WAV)) {
    console.error(`[${LABEL}] FATAL: WAV not found: ${WAV}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] starting — wav=${WAV} room=${ROOM_ID}`);
  const launchArgs = [...FLAGS, `--use-file-for-fake-audio-capture=${WAV}`];
  const browser = await chromium.launch({ headless: true, args: launchArgs });
  const context = await browser.newContext({ permissions: ['microphone', 'camera'] });
  const page = await context.newPage();

  await page.goto(LOCAL_URL).catch(() => {});
  await page.waitForTimeout(600);

  // Guest name overlay (public-style URL may show it; local may too)
  const guestNameInput = page.locator('#guest-display-name');
  if (await guestNameInput.count() > 0 && await guestNameInput.isVisible().catch(() => false)) {
    await guestNameInput.fill(NAME).catch(() => {});
    await page.getByRole('button', { name: 'Continue' }).click().catch(() => {});
    await page.waitForTimeout(300);
  }

  await handlePreflight(page);

  const nameInput = page.locator('#display-name');
  if (await nameInput.count() > 0) await nameInput.fill(NAME).catch(() => {});

  // AGENTROOM has auto_admit=1 → server auto-admits
  const joinBtn = page.getByRole('button', { name: /Ask to join/i });
  const fallback = page.getByRole('button', { name: /^Join$/i });
  if (await joinBtn.count() > 0) {
    await joinBtn.first().click().catch(() => {});
  } else if (await fallback.count() > 0) {
    await fallback.first().click().catch(() => {});
  }
  await page.waitForTimeout(1200);

  // Wait for signaling WS + myClientId
  let joined = false;
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate(() => {
      const d = window.__meetDebug || {};
      return (d.wsStatus === 'connected' || d.wsConnected === true) && !!(d.myClientId || d.clientId);
    }).catch(() => false);
    if (ok) { joined = true; break; }
    await page.waitForTimeout(500);
  }
  console.log(`[${LABEL}] IN-CALL=${joined} room=${ROOM_ID}`);

  // Stay alive forever, simple sleep loop (no heavy locators to avoid page-close crashes).
  let t = 0;
  while (true) {
    t++;
    try {
      if (t % 10 === 0) {
        const diag = await page.evaluate(async () => {
          const d = window.__meetDebug || {};
          let ob = 0;
          try {
            const st = typeof d.sfuGetStats === 'function' ? await d.sfuGetStats() : null;
            st?.forEach(s => { if (s.type === 'outbound-rtp' && s.kind === 'audio') ob = Math.max(ob, s.bytesSent || 0); });
          } catch {}
          return { ws: d.wsStatus, peers: d.sfuRemoteStreams?.size ?? 0, myId: d.myClientId, outboundBytes: ob };
        }).catch(() => null);
        if (diag) console.log(`[${LABEL}-DIAG] tick=${t}`, JSON.stringify(diag));
      }
    } catch (e) {
      console.log(`[${LABEL}] loop err ${String(e).slice(0, 80)}`);
    }
    await page.waitForTimeout(2000).catch(() => {});
  }
}

main().catch(e => { console.error(`[${LABEL}] fatal`, e); process.exit(1); });
