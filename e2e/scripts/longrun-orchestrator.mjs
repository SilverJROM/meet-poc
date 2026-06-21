#!/usr/bin/env node
/**
 * longrun-orchestrator.mjs — Batch-1 12-15min sustained call capture
 * Uses standing AGENTROOM + pm2 agent-host + relay peer2-remote-join on creepy-mini.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const AGENT = JSON.parse(fs.readFileSync(path.join(REPO, 'AGENTROOM.json'), 'utf8'));
const ROOM_ID = AGENT.id;
const PUBLIC_URL = AGENT.publicUrl || `https://voice.silverjrom.app/room/${ROOM_ID}`;
const LONGRUN_MINUTES = Number(process.env.LONGRUN_MINUTES || 15);

const ARTIFACT_DIR = path.join(REPO, 'plan/WK_0526/meet-remote-audio-e2e/projcore-run-2026-06-19/batch-artifacts/batch-1');
const METRICS_DIR = path.join(ARTIFACT_DIR, 'metrics');
const TIMELINE_PATH = path.join(ARTIFACT_DIR, 'longrun-timeline.md');

const RELAY = 'https://johnnyone.peer2-353.workers.dev/graphql';
const PEER2_SESSION = '872d483d-d986-4a3d-9486-eb59a600a55d';

const TOKEN = process.env.PEER2_MACHINE || (() => {
  try { return fs.readFileSync(path.join(REPO, '.env'), 'utf8').match(/^PEER2_MACHINE=(.+)$/m)?.[1]?.trim() || ''; } catch { return ''; }
})();

if (!TOKEN) { console.error('FATAL: PEER2_MACHINE required'); process.exit(2); }

function log(...args) { console.log('[LONGRUN]', ...args); }

async function gql(query, variables) {
  const res = await fetch(RELAY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function sendRelay(content) {
  const q = `mutation { sendRelayChatMessage(input: { sessionId: "${PEER2_SESSION}", content: ${JSON.stringify(content)}, provider: "codex" }) { __typename } }`;
  return gql(q);
}

async function listMessages() {
  const q = `query L($sid: ID!) { listAiMessages(sessionId: $sid) { role content createdAt } }`;
  const r = await gql(q, { sid: PEER2_SESSION });
  return r?.data?.listAiMessages || [];
}

function pm2Snap(filterRoom = ROOM_ID) {
  try {
    const raw = execSync('timeout 8s pm2 logs meet-poc-be --lines 200 --nostream 2>/dev/null || true', { encoding: 'utf8' });
    return raw.split('\n').filter((l) => l.includes(filterRoom) || /KNOCK|ADMITTED|EXPIRE|RECONNECT|1006|4000|ws-recv/.test(l)).join('\n');
  } catch { return ''; }
}

function hostSnap() {
  try {
    const raw = execSync('timeout 5s pm2 logs agent-host --lines 40 --nostream 2>/dev/null || true', { encoding: 'utf8' });
    return raw.split('\n').filter((l) => /HOST|DIAG|RECORDING|tiles/.test(l)).slice(-15).join('\n');
  } catch { return ''; }
}

async function ownerLogin() {
  const res = await fetch('http://localhost:4700/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'jrom@silverjrom.app', password: 'Admin@1234' }),
  });
  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/(^|,\s*)(meet[^=]*=[^;]+)/);
  return match ? match[2] : null;
}

async function triggerTranscribe(cookie, filename) {
  const res = await fetch(`http://localhost:4700/api/recordings/${encodeURIComponent(filename)}/transcribe`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  return res.status;
}

async function pollTranscript(cookie, filename, timeoutMs = 300000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const listRes = await fetch('http://localhost:4700/api/recordings?page=1&pageSize=50', { headers: { Cookie: cookie } });
    const list = await listRes.json();
    const rec = (list.recordings || []).find((r) => r.filename === filename);
    if (rec?.transcribeStatus === 'ready') {
      const tr = await fetch(`http://localhost:4700/api/recordings/${encodeURIComponent(filename)}/transcript`, { headers: { Cookie: cookie } });
      return tr.ok ? await tr.json() : null;
    }
    if (rec?.transcribeStatus === 'failed') return { error: 'transcribe failed' };
    await new Promise((r) => setTimeout(r, 5000));
  }
  return { error: 'transcribe timeout' };
}

function analyzeTranscript(transcript) {
  if (!transcript || transcript.error) return { produced: false, perSpeaker: false, reason: transcript?.error || 'no transcript' };
  const lines = Array.isArray(transcript.lines) ? transcript.lines : [];
  const names = new Set(lines.map((l) => l.name).filter(Boolean));
  const clientIds = new Set(lines.map((l) => l.clientId).filter(Boolean));
  const hasHost = [...names].some((n) => /host/i.test(String(n)));
  const hasAgent = [...names].some((n) => /peer2/i.test(String(n)));
  return {
    produced: lines.length > 0,
    perSpeaker: (hasHost && hasAgent) || clientIds.size >= 2,
    lineCount: lines.length,
    speakers: [...names],
    clientIds: [...clientIds],
    sample: lines.slice(0, 5),
  };
}

async function main() {
  fs.mkdirSync(METRICS_DIR, { recursive: true });
  const runId = Date.now();
  const timeline = [];
  log('starting run', runId, 'room', ROOM_ID, 'minutes', LONGRUN_MINUTES);

  // Confirm host alive
  const hostLines = hostSnap();
  if (!hostLines.includes('IN-CALL') && !hostLines.includes('alive tick')) {
    log('WARNING: agent-host may not be in-call; check pm2 agent-host');
  } else {
    log('host confirmed alive via pm2 logs');
  }

  const scriptContent = fs.readFileSync(path.join(REPO, 'e2e/scripts/peer2-remote-join.mjs'), 'utf8');
  const writeInstr = `cat > /home/creepy/Documents/Workspace/peer2-remote-join.mjs << 'E'\n${scriptContent}\nE\nchmod +x /home/creepy/Documents/Workspace/peer2-remote-join.mjs; echo SCRIPT_WRITTEN_LONGRUN_${runId}`;
  await sendRelay(writeInstr);
  log('script write sent');

  await new Promise((r) => setTimeout(r, 8000));

  const pkillCmd = `pkill -f 'peer2-remote-join' || true; sleep 2; echo STALE_PKILLED_LONGRUN_${runId}`;
  await sendRelay(pkillCmd);
  await new Promise((r) => setTimeout(r, 2000));

  const task = [
    `LONGRUN RUN #1 for AGENTROOM ${ROOM_ID}.`,
    `Execute: setsid nohup env LONGRUN_MINUTES=${LONGRUN_MINUTES} node /home/creepy/Documents/Workspace/peer2-remote-join.mjs "${PUBLIC_URL}" ${LONGRUN_MINUTES} > /tmp/peer2-longrun.log 2>&1 &`,
    `CRITICAL: Do NOT kill the browser/process for ${LONGRUN_MINUTES} FULL MINUTES after admit.`,
    `Monitor /tmp/peer2-longrun.log for PEER2-LONGRUN-MIN=0 through PEER2-LONGRUN-MIN=${LONGRUN_MINUTES - 1} then PEER2-LONGRUN-DONE.`,
    `At end report: PEER2-LONGRUN-DONE JSON + cat /tmp/peer2-longrun-timeline.json + any WS-CLOSE/1006/4000 errors.`,
    `Verify agent heartbeat: wsHealth.lastPongAgoMs must stay <20s every minute.`,
  ].join(' ');
  await sendRelay(task);
  log('run task sent to peer2-codex');

  const runStart = Date.now();
  const totalMs = (LONGRUN_MINUTES + 3) * 60_000; // connect buffer + full longrun
  let lastMinSeen = -1;
  const errors = [];
  const minuteSnaps = [];

  while (Date.now() - runStart < totalMs) {
    const elapsedMin = Math.floor((Date.now() - runStart) / 60000);
    if (elapsedMin > lastMinSeen) {
      lastMinSeen = elapsedMin;
      const pm2 = pm2Snap();
      const host = hostSnap();
      const snap = { minute: elapsedMin, ts: new Date().toISOString(), pm2: pm2.slice(-3000), host: host.slice(-1500) };
      minuteSnaps.push(snap);
      const hostPath = path.join(METRICS_DIR, `host-min${elapsedMin}-${runId}.json`);
      fs.writeFileSync(hostPath, JSON.stringify(snap, null, 2));
      log('orchestrator minute', elapsedMin, 'pm2 lines', pm2.split('\n').length);

      if (/1006|4000|EXPIRE|heartbeat stale/i.test(pm2)) {
        errors.push(`min${elapsedMin}:pm2_${pm2.match(/1006|4000|EXPIRE|heartbeat stale/)?.[0]}`);
      }
      if (/RECONNECT.*admitted=0/i.test(pm2)) {
        errors.push(`min${elapsedMin}:host_reconnect`);
      }
    }

    const msgs = await listMessages();
    for (const m of msgs.slice().reverse()) {
      if (m.role === 'assistant' && m.content.includes('PEER2-LONGRUN-MIN=')) {
        const matches = [...m.content.matchAll(/PEER2-LONGRUN-MIN=(\d+)\s*(\{[\s\S]*?\})/g)];
        for (const match of matches) {
          const min = Number(match[1]);
          const agentPath = path.join(METRICS_DIR, `agent-min${min}-${runId}.json`);
          if (!fs.existsSync(agentPath)) {
            try {
              fs.writeFileSync(agentPath, match[2]);
              log('captured agent min', min, 'from relay');
            } catch {}
          }
        }
      }
      if (m.content.includes('PEER2-LONGRUN-DONE')) {
        const dm = m.content.match(/PEER2-LONGRUN-DONE:\s*(\{[\s\S]*?\})/);
        if (dm) {
          fs.writeFileSync(path.join(METRICS_DIR, `longrun-done-${runId}.json`), dm[1]);
          log('PEER2-LONGRUN-DONE captured');
        }
      }
      if (m.content.includes('[PEER2-WS-NATIVE-CLOSE]') || m.content.includes('code=1006') || m.content.includes('code=4000')) {
        errors.push('relay_ws_close:' + m.content.slice(0, 120));
      }
    }

    if (elapsedMin >= LONGRUN_MINUTES + 2) break;
    await new Promise((r) => setTimeout(r, 15000));
  }

  // R8/R9: find latest recording for room + transcribe
  let r8 = { produced: false, perUserSeparable: false };
  let r9 = { produced: false, perSpeaker: false };
  try {
    const cookie = await ownerLogin();
    if (cookie) {
      const listRes = await fetch('http://localhost:4700/api/recordings?page=1&pageSize=20', { headers: { Cookie: cookie } });
      const list = await listRes.json();
      const recs = (list.recordings || []).filter((r) => r.roomId === ROOM_ID || (r.filename || '').includes(ROOM_ID));
      const latest = recs[0];
      if (latest) {
        r8.produced = true;
        r8.filename = latest.filename;
        r8.speakerCount = latest.speakerCount;
        r8.hasMetadata = latest.hasMetadata;
        r8.perUserSeparable = (latest.speakerCount || 0) >= 2 || latest.hasMetadata;
        log('R8 recording found', latest.filename, 'speakers', latest.speakerCount);

        await triggerTranscribe(cookie, latest.filename);
        log('R9 transcribe triggered');
        const transcript = await pollTranscript(cookie, latest.filename, 240000);
        r9 = analyzeTranscript(transcript);
        fs.writeFileSync(path.join(METRICS_DIR, `transcript-${runId}.json`), JSON.stringify({ r9, transcript: transcript?.lines?.slice?.(0, 20) }, null, 2));
      }
    }
  } catch (e) {
    log('R8/R9 error', String(e).slice(0, 100));
  }

  const pm2Final = pm2Snap();
  const hostFinal = hostSnap();
  const hasKnockAdmit = /KNOCK.*peer2|ADMITTED.*peer2|admitted=2/i.test(pm2Final);
  const tiles2 = /tiles=\s*2/.test(hostFinal);

  const report = {
    runId,
    roomId: ROOM_ID,
    longrunMinutes: LONGRUN_MINUTES,
    errors,
    hasKnockAdmit,
    tiles2,
    r8,
    r9,
    clean: errors.length === 0 && hasKnockAdmit && tiles2,
  };

  const md = [
    `# Longrun Timeline — Run ${runId}`,
    `Room: ${ROOM_ID} (${PUBLIC_URL})`,
    `Duration target: ${LONGRUN_MINUTES} min`,
    `Clean: ${report.clean ? 'YES' : 'NO (see errors)'}`,
    '',
    '## Errors',
    errors.length ? errors.map((e) => `- ${e}`).join('\n') : '- none captured by orchestrator',
    '',
    '## Minute snaps',
    ...minuteSnaps.map((s) => `### Min ${s.minute} (${s.ts})\nHost:\n\`\`\`\n${s.host}\n\`\`\`\nPm2:\n\`\`\`\n${s.pm2.slice(-800)}\n\`\`\``),
    '',
    '## R8 Recording',
    JSON.stringify(r8, null, 2),
    '',
    '## R9 Transcription',
    JSON.stringify(r9, null, 2),
    '',
    '## Final pm2',
    '```',
    pm2Final.slice(-2000),
    '```',
  ].join('\n');

  fs.writeFileSync(TIMELINE_PATH, md);
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'test-report.md'), [
    '# B1 Longrun Test Report',
    `Run: ${new Date(runId).toISOString()}`,
    `Target: ${LONGRUN_MINUTES}min sustained call, zero errors, audio both ways, R8+R9`,
    '',
    `## Result: ${report.clean ? 'CLEAN' : 'NOT CLEAN'}`,
    '',
    '### Open questions',
    `1. Agent myClientId+ADMITTED: knock/admit in pm2=${hasKnockAdmit}, tiles=2=${tiles2}`,
    `2. Agent heartbeat: see agent-min*.json wsHealth.lastPongAgoMs per minute`,
    `3. ICE+relay+RTT: see agent-min*.json selectedLocal/selectedRemote/rttMs`,
    '',
    '### R8',
    JSON.stringify(r8, null, 2),
    '### R9',
    JSON.stringify(r9, null, 2),
    '### Errors',
    errors.join('\n') || 'none',
  ].join('\n'));

  log('DONE report.clean=', report.clean, 'errors=', errors.length);
  console.log('LONGRUN-ORCHESTRATOR-DONE:', JSON.stringify(report));
  process.exit(report.clean ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });