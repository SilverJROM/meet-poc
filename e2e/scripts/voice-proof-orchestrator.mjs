#!/usr/bin/env node
/**
 * voice-proof-orchestrator.mjs — STEP 1: short run proving bidirectional audio on AGENTROOM
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const AGENT = JSON.parse(fs.readFileSync(path.join(REPO, 'AGENTROOM.json'), 'utf8'));
const ROOM_ID = AGENT.id;
const PUBLIC_URL = AGENT.publicUrl || `https://voice.silverjrom.app/room/${ROOM_ID}`;
const ARTIFACT_DIR = path.join(REPO, 'plan/WK_0526/meet-remote-audio-e2e/projcore-run-2026-06-19/batch-artifacts/batch-1');
const METRICS_DIR = path.join(ARTIFACT_DIR, 'metrics');

const RELAY = 'https://johnnyone.peer2-353.workers.dev/graphql';
const PEER2_SESSION = '872d483d-d986-4a3d-9486-eb59a600a55d';
const TOKEN = process.env.PEER2_MACHINE || (() => {
  try { return fs.readFileSync(path.join(REPO, '.env'), 'utf8').match(/^PEER2_MACHINE=(.+)$/m)?.[1]?.trim() || ''; } catch { return ''; }
})();
if (!TOKEN) { console.error('FATAL: PEER2_MACHINE required'); process.exit(2); }

function log(...a) { console.log('[VOICE-PROOF]', ...a); }

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

function pm2Snap() {
  try {
    const raw = execSync('timeout 8s pm2 logs meet-poc-be --lines 250 --nostream 2>/dev/null || true', { encoding: 'utf8' });
    return raw.split('\n').filter((l) => l.includes(ROOM_ID) || /KNOCK|ADMITTED|peer2|join|ws-recv/.test(l)).join('\n');
  } catch { return ''; }
}

function hostVoiceSnap() {
  try {
    const raw = execSync('timeout 5s pm2 logs agent-host --lines 80 --nostream 2>/dev/null || true', { encoding: 'utf8' });
    const lines = raw.split('\n');
    const measure = lines.filter((l) => l.includes('HOST-VOICE-MEASURE')).pop() || '';
    const tiles = lines.filter((l) => /tiles=\s*\d/.test(l)).pop() || '';
    const diag = lines.filter((l) => l.includes('HOST-DIAG')).pop() || '';
    return { measure, tiles, diag };
  } catch { return { measure: '', tiles: '', diag: '' }; }
}

async function main() {
  fs.mkdirSync(METRICS_DIR, { recursive: true });
  const runId = Date.now();
  log('STEP1 voice proof room', ROOM_ID, PUBLIC_URL);

  const scriptContent = fs.readFileSync(path.join(REPO, 'e2e/scripts/peer2-remote-join.mjs'), 'utf8');
  await sendRelay(`cat > /home/creepy/Documents/Workspace/peer2-remote-join.mjs << 'E'\n${scriptContent}\nE\nchmod +x /home/creepy/Documents/Workspace/peer2-remote-join.mjs; echo VOICE_SCRIPT_WRITTEN_${runId}`);
  await new Promise((r) => setTimeout(r, 6000));

  await sendRelay(`pkill -f 'peer2-remote-join' || true; sleep 2; echo VOICE_PKILLED_${runId}`);
  await new Promise((r) => setTimeout(r, 2000));

  const task = [
    `VOICE PROOF STEP 1 — short run only (~3min max), NOT longrun.`,
    `Run: setsid nohup env VOICE_PROOF=1 node /home/creepy/Documents/Workspace/peer2-remote-join.mjs "${PUBLIC_URL}" > /tmp/peer2-voice.log 2>&1 &`,
    `Wait for PEER2-VOICE-RESULT in log (or up to 3min). Then report:`,
    `- PEER2-VOICE-RESULT JSON (ice, pair type, rtt, agentHearsHost, hasOutboundAudio)`,
    `- cat /tmp/peer2-voice-result.json`,
    `- any createOffer/setLocal/ICE failure from log`,
    `Do NOT keep alive 15min. Exit after voice result.`,
  ].join(' ');
  await sendRelay(task);
  log('voice task sent');

  const start = Date.now();
  const timeoutMs = 200_000;
  let agentResult = null;
  let relayReport = null;

  while (Date.now() - start < timeoutMs) {
    const msgs = await listMessages();
    for (const m of msgs.slice().reverse()) {
      if (m.createdAt && m.createdAt < '2026-06-20 08:22' && !m.content.includes('VOICE')) continue;
      if (m.role === 'assistant' && m.content.includes('PEER2-VOICE-RESULT')) {
        const match = m.content.match(/PEER2-VOICE-RESULT:\s*(\{[\s\S]*?\})/);
        if (match) {
          try { agentResult = JSON.parse(match[1]); relayReport = m.content.slice(0, 3000); break; } catch {}
        }
      }
      if (m.role === 'assistant' && (m.content.includes('PEER2-JOIN-RESULT') || m.content.includes('PEER2-FAIL-DUMP')) && !agentResult) {
        relayReport = m.content.slice(0, 3000);
      }
    }
    if (agentResult) break;
    await new Promise((r) => setTimeout(r, 5000));
  }

  const hostSnap = hostVoiceSnap();
  const pm2 = pm2Snap();
  let hostMeasuresAgent = null;
  const hm = hostSnap.measure.match(/\[HOST-VOICE-MEASURE\]\s*(\{[\s\S]*\})/);
  if (hm) try { hostMeasuresAgent = JSON.parse(hm[1]); } catch {}

  const hasKnockAdmit = /KNOCK|ADMITTED.*peer2|admitted=2/i.test(pm2);
  const tiles2 = /tiles=\s*2/.test(hostSnap.tiles);

  const report = {
    runId,
    roomId: ROOM_ID,
    step: 'voice-proof',
    agent: agentResult,
    hostMeasuresAgent,
    hostHearsAgent: !!hostMeasuresAgent?.pass,
    agentHearsHost: !!agentResult?.agentHearsHost,
    iceConnected: !!agentResult?.iceConnected,
    iceConnectionState: agentResult?.iceConnectionState,
    selectedLocal: agentResult?.selectedLocal,
    selectedRemote: agentResult?.selectedRemote,
    relayPair: !!agentResult?.relayPair,
    rttMs: agentResult?.rttMs,
    hasOutboundAudio: !!agentResult?.hasOutboundAudio,
    createOfferSeen: agentResult?.createOfferSeen,
    setLocalSeen: agentResult?.setLocalSeen,
    publishStatus: agentResult?.publishStatus,
    hasKnockAdmit,
    tiles2,
    voiceBothWays: !!hostMeasuresAgent?.pass && !!agentResult?.agentHearsHost && !!agentResult?.iceConnected,
    pm2Excerpt: pm2.slice(-2500),
    hostTilesLine: hostSnap.tiles,
    hostDiagLine: hostSnap.diag,
  };

  if (!report.voiceBothWays) {
    if (!agentResult) report.failingStep = 'agent_never_reported_voice_result';
    else if (!agentResult.myClientId) report.failingStep = 'join_no_myClientId';
    else if (!hasKnockAdmit && !tiles2) report.failingStep = 'knock_or_admit_not_delivered';
    else if (!agentResult.publishStatus && !agentResult.hasOutboundAudio) report.failingStep = 'sfu_publish_or_outbound_audio';
    else if (!agentResult.createOfferSeen) report.failingStep = 'createOffer_never_ran';
    else if (!agentResult.setLocalSeen) report.failingStep = 'setLocalDescription_never_ran';
    else if (!agentResult.iceConnected) report.failingStep = 'ice_never_connected';
    else if (!agentResult.relayPair) report.failingStep = 'no_relay_pair (may be ok if srflx on short haul)';
    else if (!agentResult.agentHearsHost) report.failingStep = 'agent_decode_or_subscribe_host_audio';
    else if (!hostMeasuresAgent?.pass) report.failingStep = 'host_decode_or_subscribe_agent_audio';
    else report.failingStep = 'unknown_partial';
  }

  const outPath = path.join(METRICS_DIR, `voice-proof-${runId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'voice-proof-report.md'), [
    '# Voice Proof Report (STEP 1)',
    `Run: ${new Date(runId).toISOString()}`,
    `Room: ${ROOM_ID}`,
    '',
    `## Result: ${report.voiceBothWays ? 'VOICE BOTH WAYS OK' : 'NOT YET — see failing step'}`,
    '',
    `### ICE`,
    `- connected: ${report.iceConnected} (${report.iceConnectionState})`,
    `- pair: ${report.selectedLocal}/${report.selectedRemote} relay=${report.relayPair} rtt=${report.rttMs}ms`,
    `- publish: ${report.publishStatus} outbound=${report.hasOutboundAudio}`,
    `- createOffer: ${report.createOfferSeen} setLocal: ${report.setLocalSeen}`,
    '',
    `### Audio (B0 dual-criteria)`,
    `- host→agent (host measures): ${report.hostHearsAgent ? 'PASS' : 'FAIL'} ${JSON.stringify(hostMeasuresAgent)}`,
    `- agent→host (agent measures): ${report.agentHearsHost ? 'PASS' : 'FAIL'} ${JSON.stringify(agentResult?.agentMeasuresHost || null)}`,
    '',
    `### Signaling`,
    `- knock/admit in pm2: ${hasKnockAdmit} tiles=2: ${tiles2}`,
    '',
    report.failingStep ? `### Failing step\n${report.failingStep}` : '',
    '',
    '### Agent PEER2-VOICE-RESULT',
    '```json',
    JSON.stringify(agentResult, null, 2),
    '```',
  ].filter(Boolean).join('\n'));

  log('VOICE-PROOF-DONE:', JSON.stringify({ voiceBothWays: report.voiceBothWays, failingStep: report.failingStep, ice: report.iceConnectionState, pair: `${report.selectedLocal}/${report.selectedRemote}` }));
  console.log('VOICE-PROOF-RESULT:', JSON.stringify(report));
  process.exit(report.voiceBothWays ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });