const { chromium } = require('playwright');
const fs = require('fs');

const wav = '/home/silverjrom/silence_short.wav';
const args = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  `--use-file-for-fake-audio-capture=${wav}`,
];

function norm(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

(async () => {
  console.log('START', new Date().toISOString(), 'wav', fs.existsSync(wav));
  const browser = await chromium.launch({ headless: true, args });
  const ctx = await browser.newContext({ permissions: ['microphone', 'camera'] });
  const page = await ctx.newPage();
  const errors = [];
  const logs = [];

  await page.addInitScript(() => {
    window.__probeStart = Date.now();
    window.__gUMCount = 0;
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => {
      window.__gUMCount += 1;
      console.log(`[probe] gUM#${window.__gUMCount} ${JSON.stringify(c).slice(0, 160)}`);
      const s = await orig(c);
      const t = s.getAudioTracks()[0];
      if (t) {
        window.__localTrack = {
          label: t.label,
          id: t.id,
          readyState: t.readyState,
          enabled: t.enabled,
          muted: t.muted,
        };
      }
      return s;
    };
  });

  page.on('console', (m) => {
    const t = m.text();
    logs.push(t);
    if (/error|TypeError|ReferenceError|uncaught|exception/i.test(t)) errors.push(t);
  });
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));

  await page.goto('https://voice.silverjrom.app/room/agentroom', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(1500);

  for (const sel of ['#display-name', 'input[type=text]', 'input[placeholder*=name i]']) {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      try {
        await loc.fill('dev-b1-probe', { timeout: 2000 });
        break;
      } catch {}
    }
  }

  for (const sel of ['text=Ask to join', 'button:has-text("Ask to join")', 'button:has-text("Join")', 'text=Join now']) {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      try {
        await loc.click({ timeout: 3000 });
        console.log('clicked', sel);
        break;
      } catch (e) {
        console.log('click fail', sel, e.message);
      }
    }
  }

  await page.waitForTimeout(2000);
  const marker = await page.evaluate(async () => {
    const urls = performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter((u) => /\.js($|\?)/.test(u));
    const out = [];
    for (const u of urls) {
      try {
        const txt = await fetch(u).then((r) => r.text());
        const markers = [
          'Still trying to restore your microphone',
          'No working microphone detected',
          "We can't detect sound from your microphone",
        ].filter((m) => txt.includes(m));
        out.push({ u, len: txt.length, markers });
      } catch (e) {
        out.push({ u, err: String(e) });
      }
    }
    return out;
  });
  console.log('LOADED_JS', JSON.stringify(marker));

  const start = Date.now();
  for (let i = 0; i < 24; i += 1) {
    await page.waitForTimeout(1500);
    const data = await page
      .evaluate(() => {
        const body = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
        const dbg = window.__meetDebug || {};
        return {
          body,
          gum: window.__gUMCount,
          track: window.__localTrack,
          peers: Array.isArray(dbg.peers)
            ? dbg.peers.map((p) => ({
                name: p.name,
                state: p.state,
                audioReadyState: p.audioReadyState,
                audioEnabled: p.audioEnabled,
                micEnabled: p.micEnabled,
              }))
            : null,
        };
      })
      .catch((e) => ({ err: String(e) }));
    const t = Math.round((Date.now() - start) / 1000);
    const b = norm(data.body);
    const texts =
      b.match(
        /.{0,60}(Still trying|restore your microphone|No working microphone|can.t detect sound|Microphone 0%|Check your camera and audio).{0,80}/gi,
      ) || [];
    console.log(
      'SAMPLE',
      JSON.stringify({
        t,
        gum: data.gum,
        track: data.track,
        hit: texts.length > 0,
        peers: data.peers,
        texts,
      }),
    );
  }

  console.log('ERRORS', JSON.stringify(errors));
  console.log(
    'CONSOLE_MIC',
    JSON.stringify(logs.filter((x) => /gUM|mic|microphone|restore|silent|sweep|warning|error/i.test(x)).slice(0, 80)),
  );
  await browser.close();
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
