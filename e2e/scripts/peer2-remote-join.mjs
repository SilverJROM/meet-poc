#!/usr/bin/env node
/**
 * peer2-remote-join.mjs — thin user-faithful agent (R10 zero-setup edition)
 *
 * Simulates a real user: plain room URL, browser mic/cam permission, join,
 * measure sfuGetStats inbound-rtp + outbound-rtp after 5s in-call.
 * No speaker required — audio proof via RTP stats only.
 *
 * Usage: node peer2-remote-join.mjs <ROOM_URL>
 * Exit 0 = in-call + outbound audio bytes flowing; Exit 1 = fail.
 */
import fs from 'node:fs';
import { chromium } from 'playwright';

const ROOM_URL = process.argv[2];
if (!ROOM_URL || !ROOM_URL.startsWith('http')) {
  console.error('Usage: node peer2-remote-join.mjs <PUBLIC_ROOM_URL>');
  process.exit(2);
}

const log = (...a) => console.log('[PEER2]', ...a);

async function poll(page, fn, timeoutMs, intervalMs = 400) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await page.waitForTimeout(intervalMs);
  }
  return null;
}

const ctx = await chromium.launchPersistentContext('/tmp/peer2-agent-' + Date.now(), {
  headless: true,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ],
});
await ctx.grantPermissions(['microphone', 'camera']).catch(() => {});

const page = ctx.pages()[0] || await ctx.newPage();
page.on('console', m => console.log('AGENT-CONSOLE:', m.text()));
page.on('pageerror', e => console.log('AGENT-PAGEERROR:', String(e).slice(0, 200)));
page.on('websocket', ws => {
  ws.on('close', (code, reason) => log('WS-CLOSE code=' + (code ?? 'null'), reason || ''));
});

// 1. Navigate — plain URL, no ?sfu= (app is SFU-only)
log('STEP1: goto', ROOM_URL);
await page.goto(ROOM_URL);

// 2. Fill display name
const nameInput = page.locator('#display-name');
if (await nameInput.count() > 0) await nameInput.fill('peer2-remote');

// 3. Click join — speaker NOT required (R10: mic permission only gates join)
log('STEP3: clicking Ask to join');
await page.getByRole('button', { name: 'Ask to join' }).click();

// 4. Poll wsConnected + join dispatched
log('STEP4: waiting for wsConnected + lastJoinSentAt');
const wsOk = await poll(page, () => page.evaluate(() => {
  const d = window.__meetDebug || {};
  return (d.wsConnected && d.lastJoinSentAt) ? true : null;
}), 20_000);
if (!wsOk) {
  const d = await page.evaluate(() => window.__meetDebug || {}).catch(() => ({}));
  console.log('AGENT-FAIL: wsConnected timeout', JSON.stringify({ wsStatus: d.wsStatus, wsConnected: d.wsConnected }));
  await ctx.close();
  process.exit(1);
}

// 5. Poll in-call (autoAdmit on AGENTROOM — immediate)
log('STEP5: waiting for in-call');
const inCall = await poll(page, () => page.evaluate(() =>
  window.__meetDebug?.roomState === 'in-call' ? true : null
), 30_000, 500);

if (!inCall) {
  const d = await page.evaluate(() => window.__meetDebug || {}).catch(() => ({}));
  console.log('AGENT-FAIL: in-call timeout', JSON.stringify({ roomState: d.roomState, myClientId: d.myClientId }));
  await ctx.close();
  process.exit(1);
}
log('STEP5: in-call ✓');

// 6. Wait 5s for media to flow, then measure RTP stats (no speaker needed)
await page.waitForTimeout(5_000);

const result = await page.evaluate(async () => {
  const debug = window.__meetDebug || {};
  const stats = typeof debug.sfuGetStats === 'function' ? await debug.sfuGetStats().catch(() => null) : null;
  let inboundBytes = 0, outboundBytes = 0, iceState = null;
  if (stats) {
    stats.forEach(s => {
      if (s.type === 'inbound-rtp' && s.kind === 'audio') inboundBytes = Math.max(inboundBytes, s.bytesReceived || 0);
      if (s.type === 'outbound-rtp' && s.kind === 'audio') outboundBytes = Math.max(outboundBytes, s.bytesSent || 0);
      if (s.type === 'candidate-pair' && (s.nominated || s.state === 'succeeded')) iceState = s.state;
    });
  }
  const pcs = typeof debug.sfuPcStates === 'function' ? await debug.sfuPcStates().catch(() => null) : null;
  return {
    roomState: debug.roomState,
    publishState: debug.sfuPublishState?.status || null,
    wsConnected: !!debug.wsConnected,
    myClientId: debug.myClientId || null,
    inboundBytes,
    outboundBytes,
    icePairState: iceState,
    iceConnectionState: pcs?.iceConnectionState || null,
  };
}).catch(e => ({ error: String(e) }));

log('RESULT:', JSON.stringify(result));
console.log('PEER2-JOIN-RESULT:', JSON.stringify(result));

const outPath = '/tmp/peer2-result.json';
fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
log('wrote', outPath);

await ctx.close();
const pass = result.roomState === 'in-call' && result.outboundBytes > 0;
process.exit(pass ? 0 : 1);
