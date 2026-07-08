HARD SAFETY RULE - READ FIRST, NO EXCEPTIONS:
An agent driven on Peer2's machine must NEVER run a delete/removal command of any kind - no rm, rm -rf, del, uninstall commands, package removal, browser-profile wipes, or any operation that deletes files, applications, or data on that machine.
You are test-and-report only. Do not clean up files, uninstall, reinstall, remove browser profiles, or modify installed software. If you believe destructive cleanup is required, stop and report instead.

Task: run this exact B1 silent-microphone validation against https://voice.silverjrom.app/room/29c458502b2e. It writes one temporary script/result file and closes only the browser context it opens. It does not delete anything.

cat > /home/creepy/Documents/Workspace/b1-silent-validate.mjs <<'B1SCRIPT'
import fs from 'node:fs';
import { chromium } from 'playwright';

const roomUrl = process.argv[2];
const wav = '/tmp/peer2-b1-silence.wav';

function makeSilentWav(seconds = 4, sampleRate = 48000) {
  const samples = seconds * sampleRate;
  const dataBytes = samples * 2;
  const b = Buffer.alloc(44 + dataBytes);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + dataBytes, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(sampleRate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(dataBytes, 40);
  return b;
}

fs.writeFileSync(wav, makeSilentWav());
const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--use-file-for-fake-audio-capture=' + wav,
  ],
});
const ctx = await browser.newContext({ permissions: ['microphone', 'camera'] });
const page = await ctx.newPage();
const errors = [];
const logs = [];
await page.addInitScript(() => {
  window.__gUMCount = 0;
  const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    window.__gUMCount += 1;
    console.log('[peer2-b1] gUM#' + window.__gUMCount + ' ' + JSON.stringify(constraints).slice(0, 180));
    const stream = await orig(constraints);
    const track = stream.getAudioTracks()[0];
    if (track) window.__peer2Track = { id: track.id, label: track.label, readyState: track.readyState, enabled: track.enabled, muted: track.muted };
    return stream;
  };
});
page.on('console', (m) => {
  const text = m.text();
  logs.push(text);
  if (/error|TypeError|ReferenceError|uncaught|exception/i.test(text)) errors.push(text);
});
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));

await page.goto(roomUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.locator('#display-name').fill('peer2-b1-silent', { timeout: 15000 }).catch(() => {});
await page.getByRole('button', { name: 'Ask to join' }).click({ timeout: 15000 }).catch(async () => {
  await page.getByRole('button', { name: /^Join$|^Join now$/ }).click({ timeout: 5000 });
});
await page.waitForFunction(() => /IN-CALL|DEVICES|Microphone|You are/.test(document.body.innerText || ''), { timeout: 90000 }).catch(() => {});

const samples = [];
for (let i = 0; i < 10; i += 1) {
  await page.waitForTimeout(3000);
  samples.push(await page.evaluate(async () => {
    const d = window.__meetDebug || {};
    const report = await d.sfuGetStats?.();
    const audioStats = [];
    report?.forEach((s) => {
      if (s.kind === 'audio' || s.mediaType === 'audio' || s.type === 'media-source') {
        audioStats.push({
          id: s.id,
          type: s.type,
          kind: s.kind ?? null,
          mediaType: s.mediaType ?? null,
          audioLevel: typeof s.audioLevel === 'number' ? s.audioLevel : null,
          totalAudioEnergy: typeof s.totalAudioEnergy === 'number' ? s.totalAudioEnergy : null,
          totalSamplesDuration: typeof s.totalSamplesDuration === 'number' ? s.totalSamplesDuration : null,
          bytesSent: typeof s.bytesSent === 'number' ? s.bytesSent : null,
          bytesReceived: typeof s.bytesReceived === 'number' ? s.bytesReceived : null,
          packetsSent: typeof s.packetsSent === 'number' ? s.packetsSent : null,
          trackIdentifier: s.trackIdentifier ?? null,
        });
      }
    });
    const body = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      gum: window.__gUMCount,
      track: window.__peer2Track ?? null,
      pc: d.sfuPcStates?.() ?? null,
      publish: d.sfuPublishState ?? null,
      roomState: d.roomState ?? null,
      markers: body.match(/.{0,80}(Still trying to restore your microphone|No working microphone detected|We can't detect sound from your microphone|Check your camera and audio|Audio\/video could not start).{0,80}/gi) || [],
      audioStats,
    };
  }));
}
const result = {
  roomUrl,
  samples,
  errors,
  consoleMic: logs.filter((x) => /gUM|mic|microphone|restore|silent|sweep|warning|error/i.test(x)).slice(0, 80),
};
fs.writeFileSync('/tmp/peer2-b1-silent-result.json', JSON.stringify(result, null, 2));
console.log('PEER2-B1-SILENT-RESULT:', JSON.stringify(result));
await browser.close();
B1SCRIPT

node /home/creepy/Documents/Workspace/b1-silent-validate.mjs "https://voice.silverjrom.app/room/29c458502b2e"
echo "PEER2-B1-SILENT-DONE"