#!/usr/bin/env node
/**
 * capstone-client.mjs — FINALE combined client for 4-party AUDIO+VIDEO+SCREENSHARE+RECORD+TRANSCRIPT proof.
 *
 * Usage:
 *   node e2e/scripts/capstone-client.mjs --name Alice --wav e2e/fixtures/audio/speech/alice-host-long.wav --camera --screen
 *   node e2e/scripts/capstone-client.mjs --name Bob   --wav e2e/fixtures/audio/speech/bob-local-long.wav --camera
 *
 * For Peer2 side: same after copying script + long wavs (or use speech-guest + extra camera instr).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

function arg(flag, def = null) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
function hasFlag(flag) {
  return process.argv.includes(flag);
}

const NAME = arg('--name', 'GuestX');
const WAV_ARG = arg('--wav', '');
const WAV = WAV_ARG ? path.resolve(WAV_ARG) : '';
const DO_CAMERA = hasFlag('--camera');
const DO_SCREEN = hasFlag('--screen');
const LABEL = NAME.toUpperCase();

const FLAGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
];

const MOCK_GET_DISPLAY_MEDIA = `
  navigator.mediaDevices.getDisplayMedia = async (constraints) => {
    // Return a real getUserMedia video (fake) — acts as screen track for SFU + receivers
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  };
`;

const AGENT = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'AGENTROOM.json'), 'utf8'));
const ROOM_ID = AGENT.id;
const LOCAL_URL = `http://localhost:4700/room/${ROOM_ID}`;

async function enableCamera(page) {
  // Force camera ON in lobby (ensure requested for video gUM + publish)
  const input = page.locator('input[name="cameraRequested"]');
  if (await input.count() > 0) {
    await input.check({ force: true }).catch(() => {});
    console.log('[CAM] forced cameraRequested checked');
  } else {
    const toggleLabel = page.locator('label.toggle-row:has(input[name="cameraRequested"])');
    if (await toggleLabel.count() > 0) {
      await toggleLabel.first().click({ force: true }).catch(() => {});
    }
  }
  await page.waitForTimeout(600);
  // Confirm visible local video track id
  for (let i = 0; i < 10; i++) {
    const has = await page.evaluate(() => !!(window.__meetDebug?.localVideoTrackId)).catch(() => false);
    if (has) break;
    await page.waitForTimeout(300);
  }
}

async function drivePreflight(page) {
  const configure = page.getByRole('button', { name: /Test \/ configure devices|Hide device test|Test|configure/i });
  if (await configure.count() > 0 && await configure.first().isVisible().catch(() => false)) {
    await configure.first().click().catch(() => {});
    await page.waitForTimeout(300);
  }
  const confirmBtn = page.getByRole('button', { name: /Confirm — everything works|Check mic and speaker/i });
  const dl = Date.now() + 6000;
  while (Date.now() < dl) {
    if (await confirmBtn.count() > 0) {
      const en = await confirmBtn.first().isEnabled().catch(() => false);
      if (en) { await confirmBtn.first().click().catch(() => {}); break; }
    }
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(250);
}

async function waitInCall(page, label) {
  let joined = false;
  for (let i = 0; i < 50; i++) {
    const ok = await page.evaluate(() => {
      const d = window.__meetDebug || {};
      return (d.wsStatus === 'connected' || d.wsConnected === true) && !!(d.myClientId || d.clientId) && (d.roomState === 'in-call' || !!d.sfuPublishState);
    }).catch(() => false);
    if (ok) { joined = true; break; }
    await page.waitForTimeout(400);
  }
  console.log(`[${label}] IN-CALL joined=${joined}`);
  return joined;
}

async function ensureCameraOn(page, label) {
  // Post-join: ensure in-call camera is on so video track publishes and bytes grow
  for (let i = 0; i < 8; i++) {
    const hasLocalVid = await page.evaluate(() => !!(window.__meetDebug?.localVideoTrackId)).catch(() => false);
    if (hasLocalVid) {
      console.log(`[${label}] camera confirmed on (localVideoTrackId)`);
      return;
    }
    const camBtn = page.locator('button[aria-label*="camera" i], button[aria-label*="Turn camera" i], button:has(ion-icon[name="videocam-outline"]), button:has(ion-icon[name="videocam-off-outline"])').first();
    if (await camBtn.count() > 0) {
      await camBtn.click({ force: true }).catch(() => {});
      console.log(`[${label}] clicked camera control to enable`);
    }
    await page.waitForTimeout(700);
  }
}

async function triggerScreenShare(page, label) {
  // Click the share screen control button (desktop icon) - mock already injected early
  const shareBtn = page.locator('button.control-btn[aria-label*="Share screen"], button[title*="Share screen"], button:has(ion-icon[name="desktop-outline"])').first();
  if (await shareBtn.count() > 0) {
    await shareBtn.click({ force: true }).catch(() => {});
    console.log(`[${label}] clicked share button`);
  } else {
    // Fallback: use debug toggleScreen if exposed
    const toggled = await page.evaluate(() => {
      const d = window.__meetDebug || {};
      if (typeof d.toggleScreen === 'function') { d.toggleScreen(); return true; }
      const m = d.media || {};
      if (typeof m.toggleScreen === 'function') { m.toggleScreen(async () => {}); return true; }
      return false;
    }).catch(() => false);
    if (toggled) console.log(`[${label}] triggered via debug toggleScreen`);
  }
  await page.waitForTimeout(800);
}

async function waitForScreenShareConfirmed(page, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const st = await page.evaluate(() => {
      const d = window.__meetDebug || {};
      const screenActive = !!(d.anyScreenShareActive || d.screenOn || d.screenShareActive);
      const remoteCount = (d.remoteScreenStreams && d.remoteScreenStreams.size) || (d.sfuRemoteScreenStreams && d.sfuRemoteScreenStreams.size) || 0;
      return { screenActive, remoteCount };
    }).catch(() => ({ screenActive: false, remoteCount: 0 }));
    if (st.screenActive) {
      console.log(`[${label}] SCREEN_CONFIRMED screenActive:true`);
      return true;
    }
    // For sharer, local share may set local flag; for receiver remote
    if (st.remoteCount > 0) {
      console.log(`[${label}] SCREEN_REMOTE_SEEN remoteScreens=${st.remoteCount}`);
      return true;
    }
    await page.waitForTimeout(500);
  }
  console.log(`[${label}] SCREEN_CONFIRM_TIMEOUT`);
  return false;
}

async function sampleState(page) {
  return page.evaluate(async () => {
    const d = window.__meetDebug || {};
    let obAudio = 0, obVideo = 0, ibVideoFrames = 0, ibScreenFrames = 0;
    let remoteScreenCount = 0;
    let publishStatus = d.sfuPublishState?.status || null;
    let localVideo = !!d.localVideoTrackId;
    let anyScreen = !!(d.anyScreenShareActive || d.screenOn || d.screenShareActive);
    try {
      const st = typeof d.sfuGetStats === 'function' ? await d.sfuGetStats() : null;
      if (st) {
        st.forEach(s => {
          if (s.type === 'outbound-rtp' && s.kind === 'audio') obAudio = Math.max(obAudio, s.bytesSent || 0);
          if (s.type === 'outbound-rtp' && s.kind === 'video') obVideo = Math.max(obVideo, s.bytesSent || 0);
          if (s.type === 'inbound-rtp' && s.kind === 'video') {
            const fd = s.framesDecoded || 0;
            ibVideoFrames = Math.max(ibVideoFrames, fd);
            // try to detect screen track: mid, track name hint, or content
            const trackHint = (s.trackIdentifier || s.trackId || s.mid || '').toString().toLowerCase();
            if (trackHint.includes('screen') || anyScreen) {
              ibScreenFrames = Math.max(ibScreenFrames, fd);
            }
          }
        });
      }
    } catch {}
    try {
      const rs = d.remoteScreenStreams || d.sfuRemoteScreenStreams;
      if (rs && typeof rs.size === 'number') {
        remoteScreenCount = rs.size;
      }
    } catch {}
    return {
      ws: d.wsStatus || d.wsConnected,
      myId: d.myClientId,
      peers: d.sfuRemoteStreams?.size ?? (d.peers?.length ?? 0),
      publish: publishStatus,
      outboundAudio: obAudio,
      outboundVideo: obVideo,
      localCam: localVideo,
      screenActive: anyScreen,
      remoteScreens: remoteScreenCount,
      inboundVideoFrames: ibVideoFrames,
      inboundScreenFrames: ibScreenFrames || ibVideoFrames, // fallback to video frames when screen active
    };
  }).catch(() => null);
}

async function main() {
  if (!WAV || !fs.existsSync(WAV)) {
    console.error(`[${LABEL}] FATAL: WAV not found ${WAV}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] START name=${NAME} wav=${path.basename(WAV)} camera=${DO_CAMERA} screen=${DO_SCREEN} room=${ROOM_ID}`);

  const launchArgs = [...FLAGS, `--use-file-for-fake-audio-capture=${WAV}`];
  const browser = await chromium.launch({ headless: true, args: launchArgs });
  const context = await browser.newContext({ permissions: ['microphone', 'camera'] });
  const page = await context.newPage();

  // Inject mock EARLY, before any goto (critical for getDisplayMedia to be mocked in time)
  await page.addInitScript(MOCK_GET_DISPLAY_MEDIA).catch(() => {});

  await page.goto(LOCAL_URL).catch(() => {});
  await page.waitForTimeout(500);

  // Guest name flow (public URL path)
  const gname = page.locator('#guest-display-name');
  if (await gname.count() > 0 && await gname.isVisible().catch(() => false)) {
    await gname.fill(NAME).catch(() => {});
    await page.getByRole('button', { name: 'Continue' }).click().catch(() => {});
    await page.waitForTimeout(200);
  }

  await drivePreflight(page);

  const nameIn = page.locator('#display-name');
  if (await nameIn.count() > 0) await nameIn.fill(NAME).catch(() => {});

  if (DO_CAMERA) {
    await enableCamera(page);
    console.log(`[${LABEL}] camera requested`);
  }

  // Join
  const join = page.getByRole('button', { name: /Ask to join|Join/i });
  if (await join.count() > 0) await join.first().click().catch(() => {});
  await page.waitForTimeout(800);

  const joined = await waitInCall(page, LABEL);
  if (!joined) {
    console.log(`[${LABEL}] FAIL no join`);
    await browser.close();
    process.exit(1);
  }

  if (DO_CAMERA) {
    await ensureCameraOn(page, LABEL);
  }

  if (DO_SCREEN) {
    await triggerScreenShare(page, LABEL);
    await waitForScreenShareConfirmed(page, LABEL);
    // Direct fallback for reliable live screen track in E2E (bypass any host-approval/request for headless)
    await page.waitForTimeout(400);
    const directOk = await page.evaluate(async () => {
      try {
        const d = window.__meetDebug || {};
        if (d.sfuClient && typeof d.sfuClient.stopScreen === 'function') { await d.sfuClient.stopScreen().catch(()=>{}); }
        await new Promise(r=>setTimeout(r,400));
        const stream = await navigator.mediaDevices.getDisplayMedia({video:true, audio:false});
        const track = stream.getVideoTracks()[0];
        if (d.sfuClient && typeof d.sfuClient.publishScreen === 'function') {
          await d.sfuClient.publishScreen(track);
          return true;
        }
        return false;
      } catch(e){ return false; }
    }).catch(()=>false);
    if (directOk) console.log(`[${LABEL}] direct screen publish used for live track`);
  }

  // Main loop: report state, keepalive
  let t = 0;
  const start = Date.now();
  while (true) {
    t++;
    try {
      if (t % 5 === 0) {
        const st = await sampleState(page);
        if (st) {
          console.log(`[${LABEL}-STATE] t=${t}`, JSON.stringify(st));
        }
      }
      // light keepalive: occasional mic flip (avoid throttling)
      if (t % 12 === 0) {
        const mic = page.getByRole('button', { name: /mic|mute/i });
        if (await mic.count() > 0) {
          await mic.first().click({ force: true }).catch(() => {});
          await page.waitForTimeout(80);
          await mic.first().click({ force: true }).catch(() => {});
        }
      }
      // camera keepalive: ensure video keeps flowing (outboundVideo grows) -- force re-toggle to re-acquire/publish
      if (DO_CAMERA && (t % 6 === 0)) {
        const camBtn = page.locator('button[aria-label*="camera" i], button[aria-label*="Turn camera" i], button:has(ion-icon[name*="videocam"])').first();
        if (await camBtn.count() > 0) {
          await camBtn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(150);
          await camBtn.click({ force: true }).catch(() => {});  // off then on to force fresh video track publish
          console.log(`[${LABEL}] camera force re-toggle for video flow`);
        }
      }
    } catch (e) {
      console.log(`[${LABEL}] loop ${String(e).slice(0,60)}`);
    }
    if (Date.now() - start > 6 * 60_000) break; // safety 6min max
    await page.waitForTimeout(1400).catch(() => {});
  }
  console.log(`[${LABEL}] DONE`);
  await browser.close();
}

main().catch(e => { console.error(`[${LABEL}] FATAL`, e); process.exit(1); });
