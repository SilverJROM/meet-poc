const fs = require('fs');

function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    process.env.HOME ? `${process.env.HOME}/meet-poc-test-client/node_modules/playwright-core` : null,
    'playwright',
  ].filter(Boolean);
  const errors = [];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      errors.push(`${candidate}: ${error.message}`);
    }
  }
  throw new Error(`Unable to load Playwright module: ${errors.join(' | ')}`);
}

const { chromium } = loadPlaywright();

const roomUrl = process.env.ROOM_URL;
const displayName = process.env.DISPLAY_NAME || `remote-${Date.now()}`;
const audioWav = process.env.AUDIO_WAV || '';
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || '';
const observeMs = Number(process.env.OBSERVE_MS || '65000');
const sampleMs = Number(process.env.SAMPLE_MS || '5000');

if (!roomUrl) {
  console.error('ROOM_URL is required');
  process.exit(2);
}

const launchArgs = [
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
];

if (audioWav && fs.existsSync(audioWav)) {
  launchArgs.push(`--use-file-for-fake-audio-capture=${audioWav}`);
}

function audioStatsFromReport(stats) {
  const rows = [];
  for (const item of stats || []) {
    if (!item || typeof item !== 'object') continue;
    const isAudio =
      item.kind === 'audio' ||
      item.mediaType === 'audio' ||
      item.type === 'media-source' ||
      item.type === 'track';
    if (!isAudio) continue;
    rows.push({
      id: item.id,
      type: item.type,
      kind: item.kind ?? null,
      mediaType: item.mediaType ?? null,
      audioLevel: typeof item.audioLevel === 'number' ? item.audioLevel : null,
      totalAudioEnergy: typeof item.totalAudioEnergy === 'number' ? item.totalAudioEnergy : null,
      totalSamplesDuration: typeof item.totalSamplesDuration === 'number' ? item.totalSamplesDuration : null,
      bytesSent: typeof item.bytesSent === 'number' ? item.bytesSent : null,
      packetsSent: typeof item.packetsSent === 'number' ? item.packetsSent : null,
      bytesReceived: typeof item.bytesReceived === 'number' ? item.bytesReceived : null,
      packetsReceived: typeof item.packetsReceived === 'number' ? item.packetsReceived : null,
      concealedSamples: typeof item.concealedSamples === 'number' ? item.concealedSamples : null,
      jitter: typeof item.jitter === 'number' ? item.jitter : null,
      trackIdentifier: item.trackIdentifier ?? null,
    });
  }
  return rows;
}

function summarizeAudio(before, after) {
  const keyOf = (s) => `${s.type}:${s.kind || s.mediaType || ''}:${s.id}`;
  const beforeMap = new Map((before || []).map((s) => [keyOf(s), s]));
  let outboundBytesDelta = 0;
  let outboundPacketsDelta = 0;
  let inboundBytesDelta = 0;
  let inboundPacketsDelta = 0;
  let mediaEnergyDelta = 0;
  let mediaDurationDelta = 0;
  let inboundCount = 0;
  let outboundCount = 0;
  for (const row of after || []) {
    const prev = beforeMap.get(keyOf(row)) || {};
    if (row.type === 'outbound-rtp') {
      outboundCount += 1;
      outboundBytesDelta += Math.max(0, (row.bytesSent || 0) - (prev.bytesSent || 0));
      outboundPacketsDelta += Math.max(0, (row.packetsSent || 0) - (prev.packetsSent || 0));
    }
    if (row.type === 'inbound-rtp') {
      inboundCount += 1;
      inboundBytesDelta += Math.max(0, (row.bytesReceived || 0) - (prev.bytesReceived || 0));
      inboundPacketsDelta += Math.max(0, (row.packetsReceived || 0) - (prev.packetsReceived || 0));
    }
    if (row.type === 'media-source') {
      mediaEnergyDelta += Math.max(0, (row.totalAudioEnergy || 0) - (prev.totalAudioEnergy || 0));
      mediaDurationDelta += Math.max(0, (row.totalSamplesDuration || 0) - (prev.totalSamplesDuration || 0));
    }
  }
  return {
    outboundCount,
    inboundCount,
    outboundBytesDelta,
    outboundPacketsDelta,
    inboundBytesDelta,
    inboundPacketsDelta,
    mediaEnergyDelta,
    mediaDurationDelta,
  };
}

async function clickFirst(page, selectors, timeout = 2500) {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    if (await loc.count().catch(() => 0)) {
      try {
        await loc.click({ timeout });
        return selector;
      } catch {}
    }
  }
  return null;
}

async function fillName(page) {
  for (const selector of ['#display-name', 'input[placeholder*="name" i]', 'input[placeholder*="display" i]', 'input[type="text"]']) {
    const loc = page.locator(selector).first();
    if (await loc.count().catch(() => 0)) {
      try {
        await loc.fill(displayName, { timeout: 2500 });
        return selector;
      } catch {}
    }
  }
  return null;
}

async function readSnapshot(page) {
  return page.evaluate(async () => {
    const d = window.__meetDebug || {};
    let stats = [];
    try {
      const report = await d.sfuGetStats?.();
      stats = report ? Array.from(report.values()).map((x) => ({ ...x })) : [];
    } catch {}
    const body = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      url: location.href,
      title: document.title,
      bodySample: body.slice(0, 500),
      pc: d.sfuPcStates?.() ?? null,
      publish: d.sfuPublishState ?? null,
      peers: Array.isArray(d.peers)
        ? d.peers.map((p) => ({
            name: p.name,
            state: p.state,
            audioReadyState: p.audioReadyState,
            connectionQuality: p.connectionQuality,
          }))
        : null,
      remoteStreamCount: d.sfuRemoteStreams?.size ?? null,
      wsConnected: d.wsConnected ?? null,
      wsStatus: d.wsStatus ?? null,
      micWorking: d.micWorking ?? null,
      stats,
    };
  });
}

async function main() {
  const consoleLines = [];
  const pageErrors = [];
  const browser = await chromium.launch({
    executablePath: executablePath || undefined,
    headless: true,
    args: launchArgs,
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    permissions: ['microphone', 'camera'],
  });
  const page = await context.newPage();

  page.on('console', (msg) => {
    const text = msg.text();
    if (/error|fail|exception|uncaught|webrtc|sfu|mic|audio|join|admit/i.test(text)) {
      consoleLines.push({ type: msg.type(), text: text.slice(0, 500) });
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  let joinClick = null;
  let nameSelector = null;
  let admittedAt = null;
  let before = null;
  let after = null;
  const samples = [];

  try {
    await page.addInitScript(() => {
      window.__remoteGumCount = 0;
      const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        window.__remoteGumCount += 1;
        console.log(`[remote-live-client] gUM#${window.__remoteGumCount} ${JSON.stringify(constraints).slice(0, 200)}`);
        return orig(constraints);
      };
    });

    await page.goto(roomUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1200);
    nameSelector = await fillName(page);
    joinClick = await clickFirst(page, [
      'button:has-text("Ask to join")',
      'button:has-text("Join now")',
      'button:has-text("Join")',
      'text=Ask to join',
      'text=Join now',
    ]);

    const deadline = Date.now() + 70000;
    while (Date.now() < deadline) {
      const snap = await readSnapshot(page).catch(() => null);
      if (snap) {
        const body = snap.bodySample.toLowerCase();
        const pcOk = snap.pc && snap.pc.connectionState && snap.pc.connectionState !== 'closed';
        const hasCallUi = /leave|mute|unmute|devices|microphone|camera/i.test(snap.bodySample);
        const waiting = /waiting|ask to join|admit|host/i.test(body) && !/leave/i.test(body);
        if (pcOk || (hasCallUi && !waiting)) {
          admittedAt = new Date().toISOString();
          break;
        }
      }
      await page.waitForTimeout(1000);
    }

    before = await readSnapshot(page);
    for (let elapsed = 0; elapsed < observeMs; elapsed += sampleMs) {
      await page.waitForTimeout(sampleMs);
      const snap = await readSnapshot(page);
      samples.push({
        tMs: elapsed + sampleMs,
        pc: snap.pc,
        publish: snap.publish,
        peerCount: Array.isArray(snap.peers) ? snap.peers.length : null,
        remoteStreamCount: snap.remoteStreamCount,
        audio: audioStatsFromReport(snap.stats),
        bodySample: snap.bodySample.slice(0, 240),
      });
    }
    after = await readSnapshot(page);
  } finally {
    await browser.close().catch(() => {});
  }

  const beforeAudio = audioStatsFromReport(before?.stats || []);
  const afterAudio = audioStatsFromReport(after?.stats || []);
  const summary = summarizeAudio(beforeAudio, afterAudio);
  const result = {
    marker: 'REMOTE_LIVE_CLIENT_DONE',
    displayName,
    roomUrl,
    audioWav,
    audioWavExists: audioWav ? fs.existsSync(audioWav) : false,
    executablePath: executablePath || null,
    nameSelector,
    joinClick,
    admittedAt,
    before: before ? { ...before, stats: undefined, audio: beforeAudio } : null,
    after: after ? { ...after, stats: undefined, audio: afterAudio } : null,
    samples,
    summary,
    consoleLines,
    pageErrors,
    pass:
      !!admittedAt &&
      summary.outboundBytesDelta > 0 &&
      summary.outboundPacketsDelta > 0 &&
      summary.inboundBytesDelta > 0 &&
      summary.inboundPacketsDelta > 0 &&
      !pageErrors.length,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({ marker: 'REMOTE_LIVE_CLIENT_FATAL', message: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
