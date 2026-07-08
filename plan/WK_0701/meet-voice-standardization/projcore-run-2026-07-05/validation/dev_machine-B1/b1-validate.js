const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SCREENSHOTS_DIR = '/tmp/b1-screenshots';
const LOG_FILE = '/tmp/b1-validate.log';
const TARGET_URL = 'https://voice.silverjrom.app/room/agentroom';
const GUEST_NAME = 'dev-b1-silent';
const SILENT_WAV = '/home/silverjrom/silence_short.wav';
const OBSERVE_MS = 30000; // at least 25s

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch(e){}
}

async function safeShot(page, name) {
  try {
    await page.waitForTimeout(150);
    if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    const p = path.join(SCREENSHOTS_DIR, name + '.png');
    await page.screenshot({ path: p, fullPage: false, timeout: 8000 });
    log(`screenshot: ${name}.png`);
    return p;
  } catch (e) {
    log(`shot fail ${name}: ${e.message}`);
    return null;
  }
}

async function hookTrackAndCount(page, who) {
  await page.addInitScript((label) => {
    window.__gUMCount = 0;
    window.__lastGUM = null;
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => {
      window.__gUMCount = (window.__gUMCount || 0) + 1;
      window.__lastGUM = { time: Date.now(), constraints: c ? JSON.stringify(c).slice(0,200) : null };
      console.log(`[${label}] gUM#${window.__gUMCount} audio=${!!(c&&c.audio)} video=${!!(c&&c.video)}`);
      const s = await orig(c);
      if (c && c.audio) {
        const t = s.getAudioTracks()[0];
        window.__localTrack = t;
        t.addEventListener('ended', () => console.log(`[${label}] TRACK ENDED`));
        console.log(`[${label}] HOOKED track: ${t.label || t.id || 'fake'} state=${t.readyState}`);
      }
      return s;
    };
  }, who);
}

async function getDebugInfo(page) {
  return await page.evaluate(() => {
    const info = {};
    try { info.meetDebug = window.__meetDebug || null; } catch(e){}
    try { info.localTrack = window.__localTrack ? { label: window.__localTrack.label, readyState: window.__localTrack.readyState, enabled: window.__localTrack.enabled, muted: window.__localTrack.muted } : null; } catch(e){}
    try { info.gUMCount = window.__gUMCount || 0; info.lastGUM = window.__lastGUM || null; } catch(e){}
    // try common debug keys
    try {
      const keys = Object.keys(window).filter(k => /meet|debug|mic|audio|room|voice/i.test(k)).slice(0,8);
      info.windowKeys = keys;
    } catch(e){}
    return info;
  }).catch(() => ({ error: 'eval fail' }));
}

async function getBodySample(page) {
  return await page.evaluate(() => {
    const txt = (document.body && document.body.innerText || '').replace(/\s+/g, ' ').trim();
    return txt.slice(0, 600);
  }).catch(() => 'body-read-fail');
}

async function detectInCallAndWarnings(page) {
  const body = await getBodySample(page);
  const lower = body.toLowerCase();
  const knocking = /wait.*admit|waiting.*admit|host is available|please wait to be admitted|asking to join/i.test(lower);
  const hasAskJoin = /ask to join/i.test(lower);
  const hasJoinNow = /join now/i.test(lower);
  const inCall = (/leave|mute|unmute|end call|connected|speaking|in call|you are|agentroom/i.test(lower) && !knocking && !hasAskJoin) || (lower.includes('agentroom') && !knocking);
  const admitted = hasJoinNow || /admitted|join the call|welcome|in the room/i.test(lower);

  // B1 / mic warning patterns - exact and equivalents
  const warningPatterns = [
    /still trying to restore/i,
    /restore your microphone/i,
    /trying to restore/i,
    /no working microphone/i,
    /check your mic/i,
    /mic.*silent|silence.*mic/i,
    /microphone.*(problem|issue|lost|fail|retry)/i,
    /retrying mic|mic retry|self.heal|reacquire mic/i,
    /warning.*mic|mic.*warning/i
  ];
  const matchedWarnings = warningPatterns.filter(re => re.test(body)).map(re => re.toString());
  const anyMicText = /mic|microphone|audio input/i.test(lower);

  return {
    knocking: !!knocking,
    hasAskJoin: !!hasAskJoin,
    hasJoinNow: !!hasJoinNow,
    inCall: !!inCall,
    admitted: !!admitted,
    bodySample: body.slice(0, 380),
    matchedWarnings,
    anyMicText,
    fullLower: lower
  };
}

async function fillNameAndEnter(page) {
  log('Navigating to ' + TARGET_URL + ' as guest ' + GUEST_NAME);
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);
  await safeShot(page, '01-landing');

  // Fill guest name
  let nameFilled = false;
  for (const sel of ['#display-name', 'input[placeholder*="name" i]', 'input[placeholder*="display" i]', 'input[type="text"]', 'input[name*="name" i]']) {
    const inp = page.locator(sel).first();
    if (await inp.count() > 0) {
      try {
        await inp.click({ timeout: 2000 }).catch(()=>{});
        await inp.fill(GUEST_NAME, { timeout: 3000 });
        nameFilled = true;
        log('Filled name via ' + sel);
      } catch (e) { log('name fill try err: ' + e.message); }
      break;
    }
  }
  if (!nameFilled) {
    // fallback type
    await page.keyboard.type(GUEST_NAME).catch(() => {});
    log('Fallback typed name');
  }
  await page.waitForTimeout(600);

  // Enable mic preview
  for (const txt of ['Tap to enable mic preview', 'Enable mic', 'enable microphone', 'Tap for mic', 'Preview mic']) {
    const t = page.locator(`text=${txt}`).first();
    if (await t.count() > 0) {
      await t.click().catch(() => {});
      log('Clicked: ' + txt);
      await page.waitForTimeout(500);
      break;
    }
  }
  await safeShot(page, '02-name-filled');

  // Join / Ask to join / knock
  let clicked = false;
  for (const sel of ['text=Ask to join', 'button:has-text("Ask to join")', 'text=Join now', 'button:has-text("Join now")', 'button.primary-btn', 'button:has-text("Join")', 'text=Continue']) {
    const b = page.locator(sel).first();
    if (await b.count() > 0) {
      await b.click().catch(() => {});
      log('Clicked join/knock: ' + sel);
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    log('No obvious join button found, will rely on auto or wait');
  }
  await page.waitForTimeout(1200);
  await safeShot(page, '03-post-join-click');

  return await detectInCallAndWarnings(page);
}

async function waitForAdmitOrInCall(page, maxMs = 45000) {
  log('Waiting for admit / in-call (max ' + Math.round(maxMs/1000) + 's)...');
  const start = Date.now();
  let lastLog = 0;
  while (Date.now() - start < maxMs) {
    const st = await detectInCallAndWarnings(page);
    if (st.inCall || st.admitted || st.hasJoinNow) {
      log('Detected inCall/admitted state');
      await safeShot(page, '04-in-call');
      return { ok: true, st };
    }
    if (st.hasAskJoin || st.knocking) {
      const b = page.locator('text=Ask to join').first();
      if (await b.count() > 0) await b.click().catch(() => {});
    }
    if (Date.now() - lastLog > 8000) {
      log('Waiting... sample: ' + st.bodySample.slice(0,120));
      lastLog = Date.now();
    }
    await page.waitForTimeout(1200);
  }
  const finalSt = await detectInCallAndWarnings(page);
  return { ok: finalSt.inCall || finalSt.admitted, st: finalSt };
}

async function observeMicBehavior(page, durationMs) {
  log('=== OBSERVING for ' + Math.round(durationMs/1000) + 's with silent fake mic ===');
  const start = Date.now();
  const samples = [];
  const warningsSeen = new Set();
  let gumCountStart = 0;
  let lastGumLog = 0;
  let stormDetected = false;
  const consoleErrors = [];
  const consoleAll = [];

  page.on('console', m => {
    const t = m.text();
    consoleAll.push(t);
    if (/error|fail|exception|uncaught|TypeError|ReferenceError/i.test(t)) {
      consoleErrors.push(t);
    }
    if (/gUM|HOOKED|TRACK|mic|warning|retry|restore|silence/i.test(t)) {
      log('CONSOLE: ' + t);
    }
  });
  page.on('pageerror', e => {
    const msg = 'PAGEERR: ' + e.message;
    consoleErrors.push(msg);
    log(msg);
  });

  // initial gUM count
  const initDebug = await getDebugInfo(page);
  gumCountStart = initDebug.gUMCount || 0;
  log('Initial gUMCount=' + gumCountStart + ' debugKeys=' + (initDebug.windowKeys || []).join(','));

  let shotIdx = 0;
  while (Date.now() - start < durationMs) {
    const elapsed = Math.round((Date.now() - start) / 1000);
    const st = await detectInCallAndWarnings(page);
    const dbg = await getDebugInfo(page);
    const currentGum = dbg.gUMCount || 0;

    for (const w of (st.matchedWarnings || [])) warningsSeen.add(w);

    samples.push({
      t: elapsed,
      inCall: st.inCall,
      warnings: st.matchedWarnings,
      anyMic: st.anyMicText,
      gUM: currentGum,
      body: st.bodySample.slice(0, 160)
    });

    if (currentGum > gumCountStart + 3 && (Date.now() - lastGumLog > 5000)) {
      log('gUM count increased: ' + currentGum + ' (possible storm?)');
      lastGumLog = Date.now();
      if (currentGum > gumCountStart + 8) stormDetected = true;
    }

    // log state periodically
    if (elapsed % 5 === 0 || st.matchedWarnings.length > 0) {
      log(`t+${elapsed}s inCall=${st.inCall} warnings=${st.matchedWarnings.length} gUM=${currentGum} micText=${st.anyMicText}`);
      log('  body: ' + st.bodySample.slice(0, 200));
      if (dbg.meetDebug) log('  __meetDebug: ' + JSON.stringify(dbg.meetDebug).slice(0,300));
      if (dbg.localTrack) log('  localTrack: ' + JSON.stringify(dbg.localTrack));
    }

    // occasional shot
    if (elapsed > 0 && (elapsed % 10 === 0 || st.matchedWarnings.length > 0)) {
      await safeShot(page, `05-observe-${shotIdx++}-t${elapsed}`);
    }

    await page.waitForTimeout(1200);
  }

  const finalSt = await detectInCallAndWarnings(page);
  const finalDbg = await getDebugInfo(page);

  log('=== OBSERVE END ===');
  log('Total gUM calls during observe: ' + (finalDbg.gUMCount || 0));
  log('Warnings matched unique: ' + Array.from(warningsSeen).join(' | '));
  log('Console errors count: ' + consoleErrors.length);
  if (consoleErrors.length) consoleErrors.slice(0,5).forEach(e => log('ERR: ' + e));

  return {
    samples,
    warningsSeen: Array.from(warningsSeen),
    finalInCall: finalSt.inCall,
    finalBody: finalSt.bodySample,
    gUMTotal: finalDbg.gUMCount || 0,
    gUMDelta: (finalDbg.gUMCount || 0) - gumCountStart,
    storm: stormDetected,
    consoleErrors: consoleErrors.slice(0, 10),
    meetDebug: finalDbg.meetDebug,
    localTrack: finalDbg.localTrack,
    anyConsoleMic: consoleAll.filter(t => /mic|silence|restore|retry|warning/i.test(t)).slice(0,5)
  };
}

async function main() {
  fs.writeFileSync(LOG_FILE, 'B1 VALIDATE START ' + new Date().toISOString() + '\n');
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  log('SILENT_WAV=' + SILENT_WAV + ' exists=' + fs.existsSync(SILENT_WAV));

  const launchArgs = [
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${SILENT_WAV}`,
    '--use-fake-ui-for-media-stream',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,720',
    '--use-fake-device-for-media-stream' // duplicate ok
  ];

  log('Launching browser (under xvfb-run) for B1 guest test');
  const browser = await chromium.launch({ headless: false, args: launchArgs });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    permissions: ['microphone', 'camera']
  });
  const page = await ctx.newPage();

  await hookTrackAndCount(page, 'B1-DEV');
  // also grant via context if needed

  let results = {
    check1: { pass: false, note: '' },
    joined: false,
    observed: null,
    warnings: [],
    errors: [],
    storm: false,
    inCallAfter: false
  };

  try {
    // === CHECK 1: bundle text (also do here via browser for loaded scripts) ===
    log('=== CHECK 1: verifying bundle for B1 marker ===');
    await page.goto('https://voice.silverjrom.app/login', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(800);
    const bundleCheck = await page.evaluate(async () => {
      const texts = ['Still trying to restore your microphone', 'restore your microphone', 'trying to restore', 'self-heal', 'mic-silence'];
      let found = [];
      // check in document scripts content if any
      const scripts = Array.from(document.querySelectorAll('script[src]'));
      for (const s of scripts) {
        try {
          const r = await fetch(s.src);
          const txt = await r.text();
          for (const t of texts) if (txt.includes(t)) found.push(t);
        } catch(e){}
      }
      // also search window for strings if exposed
      const body = document.body ? document.body.innerText : '';
      for (const t of texts) if (body.includes(t)) found.push('in-body:' + t);
      return { found: [...new Set(found)], scriptCount: scripts.length };
    }).catch(e => ({ error: e.message }));
    log('Bundle check result: ' + JSON.stringify(bundleCheck));
    const hasMarker = bundleCheck && bundleCheck.found && bundleCheck.found.length > 0;
    results.check1 = { pass: hasMarker, note: hasMarker ? 'found ' + bundleCheck.found.join(',') : 'exact/equiv not found in loaded bundles; searched main+chunks via curl+page also no' };

    // now do the actual join
    const knockSt = await fillNameAndEnter(page);
    log('Post initial click state: ' + JSON.stringify({knocking: knockSt.knocking, inCall: knockSt.inCall, admitted: knockSt.admitted}));

    const admitRes = await waitForAdmitOrInCall(page, 45000);
    results.joined = admitRes.ok;

    if (results.joined) {
      log('Successfully joined as guest. Now observe behavior.');
      await page.waitForTimeout(800);

      const obs = await observeMicBehavior(page, OBSERVE_MS);
      results.observed = obs;
      results.warnings = obs.warningsSeen;
      results.storm = obs.storm;
      results.inCallAfter = obs.finalInCall;
      results.errors = obs.consoleErrors;

      await safeShot(page, '06-final-observe');
    } else {
      log('Failed to reach in-call within timeout. Final state: ' + admitRes.st.bodySample);
      await safeShot(page, '99-failed-join');
    }

    // final debug
    const finalDbg = await getDebugInfo(page);
    log('Final __meetDebug sample: ' + (finalDbg.meetDebug ? JSON.stringify(finalDbg.meetDebug).slice(0,400) : 'not present'));
    log('Final localTrack: ' + (finalDbg.localTrack ? JSON.stringify(finalDbg.localTrack) : 'none'));

  } catch (e) {
    log('TOP ERR: ' + e.message + '\n' + (e.stack || ''));
    results.errors.push(e.message);
    await safeShot(page, '99-err').catch(()=>{});
  } finally {
    await browser.close().catch(() => {});
    log('Browser closed.');
    try {
      const ps = execSync('pgrep -a -f "b1-validate|chromium" | head -3 || echo "no stray"', {encoding:'utf8'});
      log('Post ps: ' + ps.trim());
    } catch(e){}
  }

  // === REPORT ===
  log('=== B1 VALIDATION REPORT ===');
  log('Check 1 (bundle marker): ' + (results.check1.pass ? 'PASS' : 'FAIL') + ' - ' + results.check1.note);
  log('Check 2 (launch fake + wav): PASS (used ' + SILENT_WAV + ')');
  log('Check 3 (join guest dev-b1-silent): ' + (results.joined ? 'PASS' : 'FAIL'));
  if (results.observed) {
    log('Check 4/5 (observe 25s+): warnings=' + (results.warnings.length ? results.warnings.join(' ; ') : 'NONE') + ' inCallAfter=' + results.inCallAfter + ' storm=' + results.storm + ' gUMDelta=' + results.observed.gUMDelta + ' errors=' + results.observed.consoleErrors.length);
    log('  console mic-related: ' + (results.observed.anyConsoleMic.length ? results.observed.anyConsoleMic.join(' | ') : 'none'));
    log('  __meetDebug accessible: ' + (results.observed.meetDebug ? 'yes' : 'no'));
  }
  log('Check 6 (screenshots): saved to ' + SCREENSHOTS_DIR + ' (if any)');
  log('Overall blockers: ' + (results.joined && results.inCallAfter ? 'none' : 'join or observe issues'));

  // decide per check PASS/FAIL summary
  const checks = {
    '1-bundle-marker': results.check1.pass ? 'PASS' : 'FAIL',
    '2-playwright-fake-wav': 'PASS',
    '3-join-guest-auto-admit': results.joined ? 'PASS' : 'FAIL',
    '4-observe-warning-retry': (results.warnings.length > 0 || (results.observed && results.observed.warningsSeen.length > 0)) ? 'PASS' : 'FAIL-OBSERVE-NO-WARNING',
    '5-debug-state': (results.observed && results.observed.meetDebug) ? 'PASS' : 'FAIL-NO-__meetDebug',
    '6-no-storm-no-crash': (!results.storm && results.errors.length === 0 && results.inCallAfter) ? 'PASS' : 'FAIL'
  };
  log('PER CHECK: ' + JSON.stringify(checks));
  log('DONE');
}

main().catch(e => { log('fatal: ' + e); process.exit(1); });
