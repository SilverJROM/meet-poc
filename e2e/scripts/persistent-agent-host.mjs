#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { waitForOutboundReady, waitForInboundReady, measureAllRemotePublishers, setStartMeasureMarker, waitForStartMeasureMarker, waitForBarrierCurrentTracksAndBytes } from './lib/measuring-client-core.mjs';

const AGENT = JSON.parse(fs.readFileSync('AGENTROOM.json', 'utf8'));
const ROOM_ID = AGENT.id;
const PUBLIC_URL = AGENT.publicUrl || `https://voice.silverjrom.app/room/${ROOM_ID}`;
const LOGIN_URL = 'http://localhost:4700/login';
const PW = 'Admin@1234';
const EMAIL = 'jrom@silverjrom.app';
const FLAGS = ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
const TONE_HOST = path.resolve(process.cwd(), 'e2e/fixtures/audio/tone-440.wav');

const MOCK_GET_DISPLAY_MEDIA = `
  navigator.mediaDevices.getDisplayMedia = async (constraints) => {
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  };
`;

async function main() {
  console.log("[PERSISTENT-HOST] starting (host local URL, guest public)", ROOM_ID);
  const launchArgs = [...FLAGS];
  if (fs.existsSync(TONE_HOST)) launchArgs.push(`--use-file-for-fake-audio-capture=${TONE_HOST}`);
  const browser = await chromium.launch({ headless: true, args: launchArgs });
  console.log('[HOST] browser launched');
  const context = await browser.newContext({ permissions: ['microphone', 'camera'] });
  const page = await context.newPage();
  await page.addInitScript(MOCK_GET_DISPLAY_MEDIA).catch(() => {});

  // Login
  await page.goto(LOGIN_URL).catch(()=>{});
  await page.locator('input[type="email"], #login-email').fill(EMAIL).catch(()=>{});
  await page.locator('input[type="password"], #login-password').fill(PW).catch(()=>{});
  await page.getByRole('button', { name: /Sign in|Log in/i }).click().catch(() => {});
  await page.waitForTimeout(1200);
  console.log('[HOST] login done');

  // Join (full preflight to pass gate that calls ws.connect + sends join)
  const full = "http://localhost:4700/room/" + ROOM_ID; // no ?sfu=0 — proper SFU media to remote agents
  await page.goto(full).catch(()=>{});
  await page.waitForTimeout(600);

  // full driveLobbyPreflight (B0 rig style) to satisfy media/speaker gates
  const configure = page.getByRole('button', { name: /Test \/ configure devices|Hide device test|Test|configure/i });
  if (await configure.count() > 0) { await configure.first().click().catch(() => {}); }
  await page.waitForTimeout(400);
  const testSpk = page.getByRole('button', { name: 'Test speaker' });
  if (await testSpk.count() > 0) { await testSpk.first().click().catch(()=>{}); await page.waitForTimeout(1100); }
  const yes = page.locator('button.speaker-confirm-yes, button:has-text("Yes")').first();
  if (await yes.count() > 0 && await yes.isVisible().catch(() => false)) { await yes.click().catch(() => {}); await page.waitForTimeout(350); }
  const confirmBtn = page.getByRole('button', { name: /Confirm — everything works|Check mic and speaker/i });
  if (await confirmBtn.count() > 0) { await confirmBtn.first().click().catch(() => {}); }
  await page.waitForTimeout(400);

  const name = page.locator('#display-name');
  if (await name.count() > 0) await name.fill('host').catch(()=>{});
  await page.getByRole('button', { name: 'Join' }).click().catch(() => {});
  await page.waitForTimeout(1200);

  // Wait for real signaling WS + myClientId (not just UI tile)
  let joinedSignaling = false;
  for (let i = 0; i < 25; i++) {
    const ok = await page.evaluate(() => {
      const d = window.__meetDebug || {};
      return (d.wsStatus === 'connected' || d.wsConnected === true) && (d.myClientId || d.clientId);
    }).catch(() => false);
    if (ok) { joinedSignaling = true; console.log('[HOST] signaling WS connected + myClientId'); break; }
    await page.waitForTimeout(500);
  }
  if (!joinedSignaling) {
    // fallback selector for UI only
    await page.waitForSelector('.call-panel, app-tile', { timeout: 10000 }).catch(() => {});
  }
  console.log('[PERSISTENT-HOST] IN-CALL as host on', ROOM_ID);

  // Forever auto admit + keep + rich diag (lead with existing __meetDebug + getStats)
  let t = 0;
  let recordingStarted = false;
  let recordingStartTick = 0;
  let screenShareStarted = false;
  while (true) {
    t++;
    try {
      const tiles = await page.locator('app-tile').count().catch(() => 0);

      // admit
      const admits = page.getByRole('button', { name: /Admit/i });
      const n = await admits.count().catch(() => 0);
      for (let i=0; i<n; i++) {
        await admits.nth(i).click().catch(()=>{});
        console.log('[HOST] admitted', i);
      }
      if (n === 0 && (t % 4 === 0)) {
        const show = page.getByRole('button', { name: /participants/i });
        if (await show.count() > 0) await show.first().click({force:true}).catch(()=>{});
      }

      // Host-side proof: robust per-publisher measurement of ALL remotes (440 host self not included).
      // Uses same gates + per-track FFT (8192, 300-1500) + per-track bytes + tone attribution as locals.
      // For clean 4-way: when 3 remote publishers present, run 20s window once.
      let remotePeerCount = 0;
      try {
        remotePeerCount = await page.evaluate(async () => {
          const d = window.__meetDebug || {};
          const streams = d?.sfuRemoteStreams;
          if (!streams || streams.size === 0) return 0;
          let stats = null;
          try { if (d?.sfuGetStats) stats = await d.sfuGetStats(); } catch {}
          const byTrack = {};
          if (stats) {
            const idMap = {};
            stats.forEach(s => { idMap[s.id] = s; });
            stats.forEach(s => {
              if (s.type === 'inbound-rtp' && s.kind === 'audio') {
                let tid = s.trackIdentifier;
                if (!tid && s.trackId) tid = idMap[s.trackId]?.trackIdentifier;
                if (tid) byTrack[tid] = Math.max(byTrack[tid]||0, s.bytesReceived||0);
              }
            });
          }
          let act = 0;
          for (const [cid, st] of streams) {
            const t = st && st.getAudioTracks && st.getAudioTracks()[0];
            if (t && t.readyState === 'live') {
              const tid = t.id;
              if (Object.keys(byTrack).length === 0 || (byTrack[tid]||0) > 0) act++;
            }
          }
          return act;
        }).catch(() => 0);
      } catch {}
      const tilesNow = await page.locator('app-tile').count().catch(() => 0);
      if (tilesNow >= 3) remotePeerCount = 3;
      if (false) { // DISABLED: host-side measurement block (grok-added) crashed the page with heavy AudioContext/barrier ops; host only needs to host+admit+record. Locals/agent do the measuring.
        try {
          const LABEL = 'HOST';
          await waitForOutboundReady(page, LABEL, 20_000);
          await waitForInboundReady(page, LABEL, 3, 25_000);
          const barrierOk = await waitForBarrierCurrentTracksAndBytes(page, LABEL, 3);
          if (!barrierOk) {
            console.log('[HOST-BARRIER-FAIL] did not achieve 10s stable >0 bytes for all 3 peers (incl agent 660); NOT setting START');
            await page.waitForTimeout(1000);
            continue;
          }
          // wait for locals' barrier files (they write after their check)
          const fsmod = await import('node:fs');
          const barFiles = ['/tmp/bar-local1.ok', '/tmp/bar-local2.ok'];
          const barDl = Date.now() + 30000;
          for (const f of barFiles) {
            while (!fsmod.existsSync(f) && Date.now() < barDl) await new Promise(r => setTimeout(r, 400));
          }
          console.log('[HOST] local BARRIER files seen');
          // wait for orchestration confirmation that agent also passed its 10s barrier with >0 bytes (we will relay-poll and touch when seen)
          const agentBar = '/tmp/agent-barrier-passed';
          const agentDl = Date.now() + 60000;
          while (!fsmod.existsSync(agentBar) && Date.now() < agentDl) await new Promise(r => setTimeout(r, 500));
          if (!fsmod.existsSync(agentBar)) {
            console.log('[HOST] no /tmp/agent-barrier-passed (agent did not confirm 10s >0 for its peers); NOT setting START');
            continue;
          }
          console.log('[HOST] agent BARRIER also confirmed via signal');
          // ensure bar-host.log non-empty for this run (header)
          try {
            fsmod.writeFileSync('/tmp/bar-host.log', `=== HOST RUN ${new Date().toISOString()} BARRIER PASSED ===\n`, { flag: 'w' });
          } catch {}
          // Coordinated START: set marker so all (locals + agent) start 20s window together
          await setStartMeasureMarker(page);
          try { (await import('node:fs')).writeFileSync('/tmp/START_MEASURE_AT', String(Date.now())); } catch {}
          console.log('[HOST] START_MEASURE_AT set for 20s coordinated window (all 4 should measure now)');
          // Host (440Hz) measures the 3 other participants: agent=660, local1=940, local2=1100
          const result = await measureAllRemotePublishers(page, [660, 940, 1100], 20_000, 440);
          if (result && result.publishers && result.publishers.length) {
            for (const pub of result.publishers) {
              console.log('[HOST-MEASURES]', JSON.stringify(pub));
            }
            console.log('[HOST-MEASURES-ALL]', JSON.stringify({
              count: result.publishers.length,
              matrixOk: result.matrixOk,
              matrixError: result.matrixError ?? null,
              byTone: result.publishers.map(p => ({ clientId: p.clientId, tone: p.attributedToneHz, pass: p.pass, energyMs: p.energyAboveFloorMs, bytesDelta: p.perTrackBytesDelta }))
            }));
            // GUARANTEE non-empty /tmp/bar-host.log with MEAS-ALL + verify size
            try {
              const fs = await import('node:fs');
              fs.writeFileSync('/tmp/bar-host.log', JSON.stringify({ ts: Date.now(), 'HOST-MEASURES-ALL': { count: result.publishers.length, matrixOk: result.matrixOk, matrixError: result.matrixError ?? null, byTone: result.publishers.map(p => ({ clientId: p.clientId, tone: p.attributedToneHz, pass: p.pass, bytesDelta: p.perTrackBytesDelta })) } }) + '\n', { flag: 'a' });
              try {
                const hsz = fs.statSync('/tmp/bar-host.log').size;
                console.log(`[HOST] ARTIFACT-VERIFY /tmp/bar-host.log size=${hsz}`);
                if (hsz === 0) console.error('[HOST] FATAL: bar-host.log empty after MEAS write');
              } catch (se) { console.log('[HOST] stat bar-host.log err', String(se).slice(0,60)); }
            } catch (e) { console.log('[HOST] err writing bar-host.log', String(e).slice(0,100)); }
          } else if (result && result.error) {
            console.log('[HOST-MEAS-ERR]', result.error);
          }
        } catch (e) {
          console.log('[HOST-MEAS-ERR]', String(e).slice(0, 200));
          globalThis.__hostFullMatrixDone = false; // allow retry on transient
        }
      } else if (remotePeerCount > 0 && remotePeerCount < 3) {
        if ((t % 6) === 0) {
          console.log('[HOST] partial remotes, waiting for full 3:', remotePeerCount);
        }
      }

      // Recording: single guarded attempt once 2+ tiles present; idempotent + non-fatal.
      // Tries record button first, falls back to toggleRecording() API. Stop after ~4min (~170 ticks @1.4s) for full window.
      if (tiles >= 2 && !recordingStarted) {
        try {
          const rec = page.getByRole('button', { name: /record/i });
          if (await rec.count().catch(() => 0) > 0) {
            await rec.first().click().catch(() => {});
            recordingStarted = true;
            recordingStartTick = t;
            console.log('[HOST] RECORDING started (tiles=', tiles, ')');
          } else {
            const toggled = await page.evaluate(() => {
              const d = window.__meetDebug || {};
              if (typeof d.toggleRecording === 'function') { d.toggleRecording(); return true; }
              return false;
            }).catch(() => false);
            if (toggled) {
              recordingStarted = true;
              recordingStartTick = t;
              console.log('[HOST] RECORDING started via toggleRecording()');
            }
          }
        } catch (e) {
          console.log('[HOST] recording start err (non-fatal):', String(e).slice(0, 80));
        }
      }
      if (recordingStarted && (t - recordingStartTick) >= 170) {
        try {
          const rec = page.getByRole('button', { name: /record|stop/i });
          if (await rec.count().catch(() => 0) > 0) {
            await rec.first().click().catch(() => {});
            console.log('[HOST] RECORDING stopped');
            try {
              const up = await page.evaluate(() => {
                const d = window.__meetDebug || {};
                return { upload: d.lastRecordingUpload || null, sources: d.recorderSourceCount, meta: d.lastMetadataUpload || null };
              });
              console.log('[HOST-RECORDING]', JSON.stringify(up));
            } catch {}
            recordingStarted = false;
          }
        } catch (e) {
          console.log('[HOST] recording stop err (non-fatal):', String(e).slice(0, 80));
        }
      }

      // SCREENSHARE on HOST: trigger at tiles>=4 (simple toggle like working 04:39 run). Uses built-in MOCK.
      if (tiles >= 4 && !screenShareStarted) {
        try {
          const toggled = await page.evaluate(() => {
            const d = window.__meetDebug || {};
            if (typeof d.toggleScreen === 'function') { d.toggleScreen(); return true; }
            const m = d.media || {};
            if (typeof m.toggleScreen === 'function') { m.toggleScreen(async () => {}); return true; }
            const btns = document.querySelectorAll('button[aria-label*="Share screen"], button[title*="Share screen"], button:has(ion-icon[name="desktop-outline"])');
            if (btns.length) { btns[0].click(); return true; }
            return false;
          }).catch(() => false);
          if (toggled) {
            screenShareStarted = true;
            console.log('[HOST] SCREENSHARE triggered via toggleScreen (tiles=', tiles, ')');
          } else {
            const shareBtn = page.getByRole('button', { name: /Share screen|desktop/i }).first();
            if (await shareBtn.count().catch(() => 0) > 0) {
              await shareBtn.click({ force: true }).catch(() => {});
              screenShareStarted = true;
              console.log('[HOST] SCREENSHARE clicked via button');
            }
          }
        } catch (e) {
          console.log('[HOST] screenshare trigger err (non-fatal):', String(e).slice(0, 80));
        }
      }

      // keepalive
      if (t % 5 === 0) {
        const m = page.getByRole('button', { name: /mic|mute/i });
        if (await m.count() > 0) { await m.first().click().catch(()=>{}); await page.waitForTimeout(100); await m.first().click().catch(()=>{}); }
      }

      // rich diag every ~8 ticks
      if (t % 8 === 0) {
        const tiles = await page.locator('app-tile').count().catch(() => -1);
        console.log('[HOST] alive tick', t, 'tiles=', tiles, 'room=', ROOM_ID);
        try {
          const diag = await page.evaluate(async () => {
            const d = window.__meetDebug || {};
            let stats = null;
            let outboundAudioBytes = 0;
            let screenTrack = null;
            try {
              const st = (typeof d.sfuGetStats === 'function') ? await d.sfuGetStats() : null;
              if (st && typeof st.forEach === 'function') {
                let p = null, r = null, lt = null, rt = null;
                st.forEach((s) => {
                  if (s.type === 'candidate-pair' && (s.selected || s.nominated)) p = s;
                  if (p && s.type === 'local-candidate' && s.id === p.localCandidateId) lt = s.candidateType;
                  if (p && s.type === 'remote-candidate' && s.id === p.remoteCandidateId) rt = s.candidateType;
                  if (s.type === 'outbound-rtp' && s.kind === 'audio' && typeof s.bytesSent === 'number') {
                    outboundAudioBytes = Math.max(outboundAudioBytes, s.bytesSent);
                  }
                });
                if (p) stats = { pair: {local: lt, remote: rt, rtt: p.currentRoundTripTime ? Math.round(p.currentRoundTripTime*1000):null } };
              }
            } catch(e){}
            try {
              const pub = d.sfuPublishState || {};
              const tracks = (pub.tracks || []);
              screenTrack = tracks.find(tr => tr && (tr.kind === 'screen' || /screen/i.test(tr.trackName || ''))) || null;
            } catch(e){}
            return { ws: d.wsStatus, publish: d.sfuPublishState, peers: (d.peers||[]).length, myId: d.myClientId, stats, outboundAudioBytes, screenTrack };
          });
          console.log('[HOST-DIAG]', JSON.stringify(diag));
        } catch(e){ console.log('[HOST-DIAG] err', String(e).slice(0,40)); }
      }
    } catch (e) {
      console.log('[HOST] loop err', String(e).slice(0,80));
      await new Promise(r => setTimeout(r, 2000)); // back off on transient errors, don't spin
    }
    await page.waitForTimeout(1400).catch(() => {});
  }
}

main().catch(e => { console.error('fatal', e); });
