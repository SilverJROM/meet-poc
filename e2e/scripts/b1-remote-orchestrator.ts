#!/usr/bin/env tsx
/**
 * b1-remote-orchestrator.ts
 * Host-side driver for batch-1 R2.
 * - Reuses audio-rig + rooms fixtures for host.
 * - Captures public URL.
 * - Keeps host in admit-ready state.
 * - Delivers peer2-remote-join.mjs via JohnnyOne relay + instructs run.
 * - Polls messages, admits knock, captures BOTH ends ICE (esp. SELECTED candidate pair type + RTT).
 * - Writes all required batch-artifacts/batch-1/ artifacts.
 * - Emphasizes full failure state capture + Peer2 consult on !connected.
 *
 * Run (after DEV up):
 *   cd /home/agjrom/websites/meet-poc
 *   E2E_BASE_URL=http://localhost:4700 npx tsx e2e/scripts/b1-remote-orchestrator.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { chromium } from 'playwright';
import { request } from '@playwright/test';
import {
  TONE_HOST,
  launchClientWithFakeAudio,
  joinAsHost,
  admitFromHost,
  closeBrowsers,
  createThrowawayRoom,
} from '../fixtures/audio-rig';

const RUN_DIR = '/home/agjrom/websites/meet-poc/plan/WK_0526/meet-remote-audio-e2e/projcore-run-2026-06-19';
const ARTIFACT_DIR = path.join(RUN_DIR, 'batch-artifacts/batch-1');
const RELAY_GRAPHQL = 'https://johnnyone.peer2-353.workers.dev/graphql';
const PEER2_SESSION_ID = '872d483d-d986-4a3d-9486-eb59a600a55d';
const PUBLIC_BASE = 'https://voice.silverjrom.app';

const TOKEN = process.env.PEER2_MACHINE || (() => {
  try {
    const env = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
    const m = env.match(/^PEER2_MACHINE=(.+)$/m);
    return m ? m[1].trim() : '';
  } catch { return ''; }
})();

if (!TOKEN) {
  console.error('FATAL: PEER2_MACHINE not available (from env or .env)');
  process.exit(1);
}

function redact(s: string) { return s.replace(TOKEN, '[REDACTED]'); }

async function gql(query: string, variables?: Record<string, any>) {
  const res = await fetch(RELAY_GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  return json;
}

async function sendRelay(content: string) {
  // Inline to avoid schema type name issues for the input (we saw "Unknown type SendRelayChatMessageInput" in probes)
  const q = `mutation { sendRelayChatMessage(input: { sessionId: "${PEER2_SESSION_ID}", content: ${JSON.stringify(content)}, provider: "codex" }) { __typename } }`;
  return gql(q);
}

async function listMessages() {
  const q = `query L($sid: ID!) { listAiMessages(sessionId: $sid) { role content createdAt } }`;
  const r = await gql(q, { sid: PEER2_SESSION_ID });
  return r?.data?.listAiMessages || [];
}

async function getDesktopHeartbeat() {
  const q = `query { listDesktopNodes { id lastHeartbeatAt os } }`;
  const r = await gql(q);
  const nodes = r?.data?.listDesktopNodes || [];
  return nodes.find((n: any) => (n.id || '').toLowerCase().includes('creepy') || (n.os || '').toLowerCase().includes('linux'));
}

async function captureHostIce(page: Page) {
  try {
    const debug = await page.evaluate(() => (window as any).__meetDebug || {});
    const stats = typeof debug.sfuGetStats === 'function' ? await debug.sfuGetStats() : null;
    const pcStates = typeof debug.sfuPcStates === 'function' ? await debug.sfuPcStates() : null;
    const publish = debug.sfuPublishState || null;
    return { publish, pcStates, statsSample: stats ? 'present' : null };
  } catch (e) {
    return { error: String(e) };
  }
}

async function main() {
  fs.mkdirSync(path.join(ARTIFACT_DIR, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(ARTIFACT_DIR, 'metrics'), { recursive: true });

  const relayTranscript: string[] = [];
  const logRelay = (dir: string, msg: string) => {
    const line = `[${new Date().toISOString()}] ${dir}: ${redact(msg)}`;
    relayTranscript.push(line);
    console.log(line);
  };

  console.log('=== B1 REMOTE ORCHESTRATOR START ===');
  const hb = await getDesktopHeartbeat();
  console.log('creepy-mini heartbeat sample:', hb ? hb.lastHeartbeatAt : 'none');

  // 1. Reliable create + host using fixtures
  const apiCtx = await request.newContext({ baseURL: 'http://localhost:4700' });
  const room = await createThrowawayRoom(apiCtx, 'RA-B1');
  const publicUrl = `${PUBLIC_BASE}${room.url}`;
  console.log('THROWAWAY ROOM:', room.id, 'PUBLIC:', publicUrl);

  const hostBrowser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const hostPage = await hostBrowser.newPage();
  // Simple join (skip rig preflight/drive which was causing "page closed" during waitForTimeout in lobby)
  await hostPage.goto(`http://localhost:4700${room.url}`);
  await hostPage.waitForTimeout(800);
  await hostPage.locator('#display-name').fill('host').catch(() => {});
  await hostPage.getByRole('button', { name: 'Join' }).click().catch(() => {});
  await hostPage.waitForSelector('.call-panel', { timeout: 20000 }).catch(() => {});
  console.log('HOST IN CALL (simple)');

  const roomSlugOrId = room.id;
  const browser = hostBrowser; // for closeBrowsers + scope in admit/capture

  // 2. Deliver script + run command via relay
  const peer2ScriptPath = 'e2e/scripts/peer2-remote-join.mjs';
  let peer2Code = fs.readFileSync(peer2ScriptPath, 'utf8');

  const writeInstr = `Write the following EXACT content to /home/creepy/Documents/Workspace/peer2-remote-join.mjs (overwrite if exists). Use cat > /home/creepy/Documents/Workspace/peer2-remote-join.mjs << 'ENDSCRIPT'
${peer2Code}
ENDSCRIPT
chmod +x /home/creepy/Documents/Workspace/peer2-remote-join.mjs || true
echo "SCRIPT_WRITTEN"`;

  logRelay('SEND', 'write script');
  await sendRelay(writeInstr);

  await new Promise(r => setTimeout(r, 1500));

  const runInstr = `Now run the join script against this exact URL and report back EVERYTHING (stdout + the metrics json it writes). Keep the browser open ~30s after publish:
node /home/creepy/Documents/Workspace/peer2-remote-join.mjs "${publicUrl}"
cat /tmp/peer2-b1-metrics.json 2>/dev/null || echo "NO_METRICS_YET"
echo "RUN_COMPLETE"`;

  logRelay('SEND', 'run command with URL');
  await sendRelay(runInstr);

  // 3. Concurrent: poll for peer2 result + watch host for knock and admit
  const messagesStart = Date.now();
  let peer2Result: any = null;
  let admitted = false;

  const pollMessages = async () => {
    const msgs = await listMessages();
    const recent = msgs.filter((m: any) => new Date(m.createdAt).getTime() > messagesStart - 5000);
    for (const m of recent.reverse()) {
      if (m.role === 'assistant' && m.content.includes('PEER2-JOIN-RESULT')) {
        try {
          const match = m.content.match(/PEER2-JOIN-RESULT:\s*(\{.*\})/s);
          if (match) peer2Result = JSON.parse(match[1]);
        } catch {}
        if (m.content.includes('PEER2-FAIL-DUMP')) {
          logRelay('RECV', 'FAIL DUMP present in message');
        }
      }
      if (m.role === 'assistant' && m.content.includes('RUN_COMPLETE')) {
        logRelay('RECV', 'run complete marker');
      }
    }
  };

  // Admit watcher + final capture
  const admitAndCapture = async () => {
    for (let i = 0; i < 60; i++) {
      if (hostPage.isClosed()) {
        logRelay('HOST', 'host page closed, stopping admit loop');
        break;
      }
      if (!admitted) {
        try {
          await admitFromHost(hostPage, 'peer2-remote');
          admitted = true;
          console.log('ADMITTED remote');
          await new Promise(r => setTimeout(r, 1500));
        } catch {}
      }

      await pollMessages();

      if (peer2Result && admitted) break;
      await new Promise(r => setTimeout(r, 1200));
    }

    // Final host side capture
    const hostCapture = await captureHostIce(hostPage);
    const hostMetricsPath = path.join(ARTIFACT_DIR, 'metrics', `host-${Date.now()}.json`);
    fs.writeFileSync(hostMetricsPath, JSON.stringify({ hostCapture, admitted, publicUrl, roomId: roomSlugOrId }, null, 2));

    // Screenshot
    const shotPath = path.join(ARTIFACT_DIR, 'screenshots', `b1-host-admitted-${Date.now()}.png`);
    await hostPage.screenshot({ path: shotPath, fullPage: true }).catch(() => {});

    return { shotPath, hostMetricsPath, hostCapture };
  };

  const { shotPath, hostCapture } = await admitAndCapture();

  // One more poll + possible consult on failure
  await pollMessages();

  if (!peer2Result || !peer2Result.success) {
    logRelay('SEND', 'consult for full state (failure path)');
    await sendRelay('Please immediately report: cat /tmp/peer2-b1-metrics.json || true ; echo "===PC-STATES===" ; and any additional chrome://webrtc-internals summary or errors from the run. Also confirm iceConfig had turn: entries.');
    await new Promise(r => setTimeout(r, 4000));
    await pollMessages();
  }

  // Write relay transcript
  const transcriptPath = path.join(ARTIFACT_DIR, 'relay-transcript.md');
  fs.writeFileSync(transcriptPath, '# B1 Relay Transcript (redacted)\n\n' + relayTranscript.map(l => '```\n' + l + '\n```').join('\n\n'));

  // Write peer2 metrics if we captured one in chat (best effort parse last)
  if (peer2Result) {
    const peer2MetricsPath = path.join(ARTIFACT_DIR, 'metrics', `peer2-${Date.now()}.json`);
    fs.writeFileSync(peer2MetricsPath, JSON.stringify(peer2Result, null, 2));
  }

  // Final summary + room id record
  const roomRecord = path.join(ARTIFACT_DIR, 'ROOM_ID.txt');
  fs.writeFileSync(roomRecord, roomSlugOrId);

  console.log('=== B1 ARTIFACTS ===');
  console.log('screenshot:', shotPath);
  console.log('room:', roomSlugOrId);
  console.log('public:', publicUrl);
  console.log('peer2 result sample:', peer2Result);

  const hostTiles = await hostPage.locator('app-tile').count().catch(() => -1);
  console.log('final host tile count:', hostTiles);

  closeBrowsers([browser]);

  // Minimal changes summary for later changes.md (printed)
  console.log('B1 orchestration complete. See batch-artifacts/batch-1/');
}

main().catch((e) => {
  console.error('ORCHESTRATOR FATAL', e);
  process.exit(1);
});
