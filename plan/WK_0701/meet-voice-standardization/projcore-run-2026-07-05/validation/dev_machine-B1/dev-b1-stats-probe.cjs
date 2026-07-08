const { chromium } = require('playwright');
const fs = require('fs');

const wav = '/home/silverjrom/silence_short.wav';
const roomUrl = process.env.B1_ROOM_URL || 'https://voice.silverjrom.app/room/agentroom';
const displayName = process.env.B1_DISPLAY_NAME || 'dev-b1-stats';
const args = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  `--use-file-for-fake-audio-capture=${wav}`,
];

function compactStats(stats) {
  const rows = [];
  for (const item of stats || []) {
    if (!item || typeof item !== 'object') continue;
    const audio =
      item.kind === 'audio' ||
      item.mediaType === 'audio' ||
      item.type === 'media-source' ||
      item.type === 'track';
    if (!audio) continue;
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
      framesEncoded: typeof item.framesEncoded === 'number' ? item.framesEncoded : null,
      trackIdentifier: item.trackIdentifier ?? null,
    });
  }
  return rows;
}

(async () => {
  console.log('START', new Date().toISOString(), 'wav_exists', fs.existsSync(wav));
  const browser = await chromium.launch({ headless: true, args });
  const ctx = await browser.newContext({ permissions: ['microphone', 'camera'] });
  const page = await ctx.newPage();
  const errors = [];
  const logs = [];

  await page.addInitScript(() => {
    window.__gUMCount = 0;
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      window.__gUMCount += 1;
      console.log(`[stats-probe] gUM#${window.__gUMCount} ${JSON.stringify(constraints).slice(0, 220)}`);
      const stream = await orig(constraints);
      const track = stream.getAudioTracks()[0];
      if (track) {
        window.__statsProbeTrack = {
          id: track.id,
          label: track.label,
          readyState: track.readyState,
          enabled: track.enabled,
          muted: track.muted,
        };
      }
      return stream;
    };
  });

  page.on('console', (m) => {
    const text = m.text();
    logs.push(text);
    if (/error|TypeError|ReferenceError|uncaught|exception/i.test(text)) errors.push(text);
  });
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));

  await page.goto(roomUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(1500);

  for (const sel of ['#display-name', 'input[type=text]', 'input[placeholder*=name i]']) {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      try {
        await loc.fill(displayName, { timeout: 2000 });
        break;
      } catch {}
    }
  }

  for (const sel of ['button:has-text("Ask to join")', 'button:has-text("Join")', 'text=Join now']) {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      try {
        await loc.click({ timeout: 3000 });
        console.log('CLICKED', sel);
        break;
      } catch (e) {
        console.log('CLICK_FAIL', sel, e.message);
      }
    }
  }

  await page.waitForFunction(
    () => /IN-CALL|DEVICES|Microphone/i.test(document.body.innerText || ''),
    { timeout: 60000 },
  ).catch(() => undefined);

  for (let i = 0; i < 10; i += 1) {
    await page.waitForTimeout(3000);
    const sample = await page.evaluate(async () => {
      const dbg = window.__meetDebug || {};
      const report = await dbg.sfuGetStats?.();
      const stats = report ? Array.from(report.values()).map((x) => ({ ...x })) : [];
      const body = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
      const markerRegex = /.{0,80}(Still trying to restore your microphone|No working microphone detected|We can't detect sound from your microphone|Check your camera and audio|Audio\/video could not start).{0,80}/gi;
      return {
        gum: window.__gUMCount,
        track: window.__statsProbeTrack ?? null,
        pc: dbg.sfuPcStates?.() ?? null,
        publish: dbg.sfuPublishState ?? null,
        micWorking: dbg.micWorking ?? null,
        hasMicAccess: dbg.hasMicAccess ?? null,
        bodyHit:
          body.includes('Still trying to restore your microphone') ||
          body.includes('No working microphone detected') ||
          body.includes("We can't detect sound from your microphone"),
        bodyMarkers: body.match(markerRegex) || [],
        stats,
      };
    });
    console.log(
      'STATS_SAMPLE',
      JSON.stringify({
        index: i,
        gum: sample.gum,
        track: sample.track,
        pc: sample.pc,
        publish: sample.publish,
        micWorking: sample.micWorking,
        hasMicAccess: sample.hasMicAccess,
        bodyHit: sample.bodyHit,
        bodyMarkers: sample.bodyMarkers,
        audioStats: compactStats(sample.stats),
      }),
    );
  }

  console.log('ERRORS', JSON.stringify(errors));
  console.log('CONSOLE_MIC', JSON.stringify(logs.filter((x) => /gUM|mic|microphone|restore|silent|sweep|warning|stats-probe/i.test(x)).slice(0, 80)));
  await browser.close();
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
