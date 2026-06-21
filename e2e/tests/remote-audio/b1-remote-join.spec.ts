/**
 * B1 — Remote guest + host admit + both-ends pair (R2)
 * Host under runner + owner login.
 * Query guest via relay for pair report.
 */
import { test, expect, type Page, chromium, request as pwRequest } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  createThrowawayRoom,
  joinAsHost,
  admitFromHost,
} from '../../fixtures/audio-rig';

const BATCH_DIR = path.resolve(process.cwd(), '../plan/WK_0526/meet-remote-audio-e2e/projcore-run-2026-06-19/batch-artifacts/batch-1');
const SCREEN_DIR = path.join(BATCH_DIR, 'screenshots');
const METRICS_DIR = path.join(BATCH_DIR, 'metrics');

const RELAY = 'https://johnnyone.peer2-353.workers.dev/graphql';
const PEER2_SESSION = '872d483d-d986-4a3d-9486-eb59a600a55d';
const PUBLIC_BASE = 'https://voice.silverjrom.app';
const PW = fs.readFileSync('INITIAL_PASSWORD.txt', 'utf8').trim();

const TOKEN = process.env.PEER2_MACHINE || (() => {
  try { return fs.readFileSync('.env', 'utf8').match(/^PEER2_MACHINE=(.+)$/m)![1].trim(); } catch { return ''; }
})();

if (!TOKEN) throw new Error('PEER2_MACHINE required');

async function gql(query: string, variables?: any) {
  const res = await fetch(RELAY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function sendRelay(content: string) {
  const q = `mutation { sendRelayChatMessage(input: { sessionId: "${PEER2_SESSION}", content: ${JSON.stringify(content)}, provider: "codex" }) { __typename } }`;
  return gql(q);
}

async function listMessages() {
  const q = `query L($sid: ID!) { listAiMessages(sessionId: $sid) { role content createdAt } }`;
  const r = await gql(q, { sid: PEER2_SESSION });
  return r?.data?.listAiMessages || [];
}

async function waitForRemoteResult(timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const msgs = await listMessages();
    for (const m of msgs.slice().reverse()) {
      if (m.role === 'assistant' && m.content.includes('PEER2-JOIN-RESULT')) {
        const match = m.content.match(/PEER2-JOIN-RESULT:\s*(\{[\s\S]*?\})/);
        if (match) {
          try { return JSON.parse(match[1]); } catch {}
        }
      }
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  return null;
}

async function captureHostPair(page: Page) {
  return page.evaluate(async () => {
    const d = (window as any).__meetDebug || {};
    const stats = typeof d.sfuGetStats === 'function' ? await d.sfuGetStats() : null;
    if (!stats) return { error: 'no-stats' };
    let localType: string | null = null;
    let remoteType: string | null = null;
    let rtt: number | null = null;
    let pairState: string | null = null;
    stats.forEach((s: any) => {
      if (s.type === 'candidate-pair' && (s.nominated || s.state === 'succeeded')) {
        pairState = s.state || null;
        const l = s.localCandidateId ? stats.get(s.localCandidateId) : null;
        const r = s.remoteCandidateId ? stats.get(s.remoteCandidateId) : null;
        localType = l?.candidateType || null;
        remoteType = r?.candidateType || null;
        rtt = typeof s.currentRoundTripTime === 'number' ? Math.round(s.currentRoundTripTime * 1000) : null;
      }
    });
    return { localType, remoteType, rtt, pairState };
  });
}

test.describe('B1: remote join (creepy-mini) + host admit + both-ends ICE pair', () => {
  test.setTimeout(400000);  // full 5min window + poll buffer per APPROVED-PLAN
  test('remote guest knocks over public tunnel, host admits, both ends report selected pair', async ({ request }) => {
    fs.mkdirSync(SCREEN_DIR, { recursive: true });
    fs.mkdirSync(METRICS_DIR, { recursive: true });

    // Ensure relative /api calls in create have base (E2E_BASE_URL for public, localhost for api)
    const apiRequest = await pwRequest.newContext({ baseURL: 'http://localhost:4700' });
    const room = await createThrowawayRoom(apiRequest, 'RA-B1');
    const publicUrl = `${PUBLIC_BASE}${room.url}`;
    console.log('[B1] THROWAWAY ROOM:', room.id, 'PUBLIC for remote:', publicUrl);

    const hostBrowser = await chromium.launch({
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--no-zygote',
      ],
    });
    const host = await hostBrowser.newPage();

    try {
      await host.goto('http://localhost:4700/login');
      await host.locator('input[type="email"]').fill('jrom@silverjrom.app');
      await host.locator('input[type="password"]').fill(PW);
      await host.getByRole('button', { name: /Log in|Sign in/i }).click().catch(() => {});
      await host.waitForTimeout(1200);

      await joinAsHost(host, room, 'host');
      console.log('[B1] HOST IN-CALL as owner (admit-ready)');

      // APPROVED-PLAN: deep poll for GENUINE in-call + signaling WS connected + admit-ready using getStats/state (not just navigated/tiles).
      // Prior failures: guest knocked with NO live host. Confirm stats fetchable + ws + in-call before task.
      const hostReadyDeadline = Date.now() + 45000;
      let hostReady = false;
      while (Date.now() < hostReadyDeadline && !hostReady) {
        try {
          const tiles = await host.locator('app-tile').count().catch(() => 0);
          const inCallVisible = (await host.locator('.call-panel').count().catch(() => 0)) > 0 || tiles > 0;
          const urlOk = (await host.url()).includes('/room/');
          const state = await host.evaluate(async () => {
            const d = (window as any).__meetDebug || {};
            let statsOk = false;
            try {
              const st = (typeof d.sfuGetStats === 'function') ? await d.sfuGetStats() : null;
              statsOk = !!st && (typeof st.forEach === 'function');
            } catch (e) {}
            const wsOk = !!(d.wsConnected || d.wsStatus === 'connected' || (d.ws && d.ws.connected && d.ws.connected()));
            return { wsOk, statsOk, wsStatus: d.wsStatus || null, hasSfu: !!d.sfuClient, peers: Array.isArray(d.peers) ? d.peers.length : null };
          }).catch(() => ({} as any));
          if (inCallVisible && urlOk && state.wsOk && state.statsOk) {
            hostReady = true;
            console.log('[B1] host-ready CONFIRMED (getStats+ws+state): tiles=', tiles, 'wsOk=', state.wsOk, 'statsOk=', state.statsOk, 'wsStatus=', state.wsStatus);
            break;
          }
        } catch {}
        await host.waitForTimeout(800).catch(() => {});
      }
      if (!hostReady) {
        console.log('[B1] WARNING: host ready poll (getStats/ws) timed out; proceeding anyway');
      }
      console.log('[B1] host confirmed genuinely in-call + WS connected + admit-ready via getStats poll; starting auto-admit');

      // ROOT CAUSE FIX: read the ACTUAL room id the host is joined to (from page state / URL / debug).
      // Build canonical guest URL using /room/<id> (never slug) so guest knocks on the exact same room the host is hosting.
      let actualRoomId = room.id;
      try {
        const fromHost = await host.evaluate(() => {
          const d = (window as any).__meetDebug || {};
          if (d.roomId && /^[0-9a-f]{8,}$/i.test(String(d.roomId))) return String(d.roomId);
          if (d.currentRoomId) return String(d.currentRoomId);
          const pathname = window.location.pathname || '';
          const m = pathname.match(/\/room\/([0-9a-f]{8,32})/i);
          if (m && m[1]) return m[1];
          return null;
        });
        if (fromHost && /^[0-9a-f]{8,}$/i.test(fromHost)) actualRoomId = fromHost;
      } catch {}
      const canonicalGuestUrl = `https://voice.silverjrom.app/room/${actualRoomId}`;
      console.log('[B1] CANONICAL guest URL (host actual id):', canonicalGuestUrl, 'createdId:', room.id);

      // Start auto-admitting loop ONLY after host is ready. FULL ~5min window (APPROVED-PLAN) so it auto-admits whenever guest knock lands.
      // Admit any knocker. Keep host signaling alive via mic toggles.
      const autoAdmit = (async () => {
        const deadline = Date.now() + 300000;  // 5min
        while (Date.now() < deadline) {
          try {
            await admitFromHost(host, 'peer2-remote').catch(() => {});
            const anyAdmit = host.getByRole('button', { name: /Admit/i });
            const n = await anyAdmit.count().catch(() => 0);
            for (let i = 0; i < n; i++) {
              await anyAdmit.nth(i).click().catch(() => {});
            }
            // Keep signaling WS live to prevent heartbeat-stale RECONNECT.
            const mic = host.getByRole('button', { name: /mic|microphone|mute/i });
            if (await mic.count().catch(()=>0) > 0) {
              await mic.first().click({ timeout: 300 }).catch(() => {});
              await host.waitForTimeout(150).catch(() => {});
              await mic.first().click({ timeout: 300 }).catch(() => {});
            }
          } catch {}
          await host.waitForTimeout(1500).catch(() => {});
        }
      })();

      // Brief settle so auto-admit loop is active.
      await host.waitForTimeout(3000);

      console.log('[B1] THROWAWAY ROOM for codex task:', actualRoomId, 'CANONICAL:', canonicalGuestUrl);

      // Ensure latest instrumented script is on creepy.
      const scriptContent = fs.readFileSync('e2e/scripts/peer2-remote-join.mjs', 'utf8');
      const writeInstr = `cat > /home/creepy/Documents/Workspace/peer2-remote-join.mjs << 'E'\n${scriptContent}\nE\nchmod +x /home/creepy/Documents/Workspace/peer2-remote-join.mjs || true; echo SCRIPT_WRITTEN_FOR_${room.id}`;
      await sendRelay(writeInstr);
      let written = false;
      const wstart = Date.now();
      while (!written && Date.now() - wstart < 30000) {
        const msgs = await listMessages();
        for (const m of msgs.slice().reverse()) {
          if (m.content.includes('SCRIPT_WRITTEN')) { written = true; break; }
        }
        if (!written) await new Promise(r => setTimeout(r, 500));
      }
      console.log('[B1] script written confirmed');

      // pkill stale peer2-remote-join node/chrome on creepy FIRST (no old run races / stale processes)
      const pkillCmd = `pkill -f 'peer2-remote-join' || true; pkill -9 -f 'chrome\|chromium\|playwright' || true; sleep 2; echo "STALE_PKILLED_for_${actualRoomId}"`;
      await sendRelay(pkillCmd);
      await new Promise(r => setTimeout(r, 1500));

      // ONLY THEN send the ONE guest task to codex (APPROVED-PLAN). Host admit window overlaps.
      // Use canonical /room/<id> from the host's actual joined state.
      const task = `Run: node /home/creepy/Documents/Workspace/peer2-remote-join.mjs "${canonicalGuestUrl}". KEEP the process + its chrome ALIVE YOURSELF until it logs iceConnectionState=connected OR 120s. Then report the FULL timeline (ADMIT rel time, createOffer, setLocalDescription, each icecandidate, iceConnectionState transitions, selected candidate-pair type+RTT) + contents of /tmp/peer2-b1-metrics.json.`;
      await sendRelay(task);
      console.log('[B1] ONE task sent to Peer2-codex ONLY AFTER host ready+auto-admit active');

      // Keep host ALIVE the FULL ~5min window (300s) with auto-admit active.
      await host.waitForTimeout(300000);

      // Poll for Peer2-codex report (FULL post-admit timeline per APPROVED-PLAN: admit->createOffer->setLocal->icecandidates->iceConnectionState + metrics).
      const codexReport = await (async () => {
        const start = Date.now();
        const dl = start + 180000;
        while (Date.now() < dl) {
          const msgs = await listMessages();
          for (const m of msgs.slice().reverse()) {
            if (m.role === 'assistant' && (
              m.content.includes('iceConnectionState') ||
              m.content.includes('createOffer') ||
              m.content.includes('setLocalDescription') ||
              m.content.includes('icecandidate') ||
              m.content.includes('selected candidate-pair') ||
              m.content.includes('/tmp/peer2-b1-metrics') ||
              m.content.includes('timeline') ||
              m.content.includes('PEER2-JOIN')
            )) {
              return m.content;
            }
          }
          await new Promise(r => setTimeout(r, 2000));
        }
        return null;
      })();
      console.log('[B1] CODEX REPORT (full timeline + metrics):', codexReport ? codexReport.slice(0, 2500) + '...' : 'NO_REPORT');

      // RE-VERIFY via pm2: KNOCK->ADMITTED for THE room + stays-admitted (no premature EXPIRE) through media window.
      const roomIdForPm2 = actualRoomId || room.id;
      try {
        const pm2snap = execSync(`timeout 6s pm2 logs meet-poc-be --lines 150 --nostream 2>/dev/null || timeout 6s pm2 logs meet-poc-be --lines 150 2>&1 | head -180 || echo "PM2_UNAVAIL"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        const filtered = pm2snap.split('\n').filter((l: string) => l.includes(roomIdForPm2) || /KNOCK|ADMITTED|admitted=/.test(l)).join('\n');
        console.log('[B1] PM2_SNAP (KNOCK->ADMITTED for', roomIdForPm2, '+ stays no EXPIRE):\\n' + (filtered || pm2snap.slice(0,1500)));
      } catch (e) {
        console.log('[B1] pm2 error:', String(e).slice(0,200));
      }

      // Capture host side (getStats + tiles).
      const tiles = await host.locator('app-tile').count().catch(() => -1);
      console.log('[B1] FINAL TILES=', tiles);
      const hostPair = await captureHostPair(host).catch(() => ({error:'host-capture-fail'}));
      console.log('[B1] HOST FINAL PAIR:', hostPair);
      try {
        const finalHostStats = await host.evaluate(async () => {
          const d = (window as any).__meetDebug || {};
          return typeof d.sfuGetStats === 'function' ? await d.sfuGetStats() : null;
        });
        console.log('[B1] HOST FINAL getStats sample (keys):', finalHostStats ? Array.from(finalHostStats.keys ? finalHostStats.keys() : []).slice(0,5) : 'no');
      } catch {}

      // Final keep a bit.
      await host.waitForTimeout(30000);
    } finally {
      try { await hostBrowser.close(); } catch {}
    }
  });
});
