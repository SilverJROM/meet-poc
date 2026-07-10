// P3-LIVE-07: same split-host smoke as P3-LIVE-06 (module-remap-source on .123, PulseAudio
// null-sink on .140, raw remote-stream capture on page1), now passing
// speaker2ExtraQuery: 'e2eDisableAudioProcessing=1' so bot-123's join requests hard-off
// echoCancellation/noiseSuppression/autoGainControl (mic-energy.ts audioCaptureConstraints,
// media.service.ts audioConstraints/shouldDisableAudioProcessing — default path for every real
// user is unchanged, this query param is never present otherwise). See
// decisions/2026-07-10-p3-live-02-invalid-no-pc.md P3-LIVE-06 section for why: real signal
// confirmed at the PipeWire source (ground-truth parecord), real RTP delivery confirmed 1:1, but
// bot-123's captured track showed AGC/NS/EC all true — Chrome's own processing was the leading
// suspect for silencing the PipeWire-looped signal before encode.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { joinDualBrowserCallSplitHost, authenticateHarness } from './call-driver.js';
import { canDelete } from './call-ledger.js';
import {
  startRawRemoteStreamCapture,
  stopDomRemoteAudioCapture,
  sampleInboundAudioStats,
  sampleOutboundAudioStats,
} from './dom-audio-capture.js';
import {
  launchRemoteChrome,
  killRemoteChrome,
  openCdpTunnel,
  closeCdpTunnel,
  setRemoteDefaultSource,
  loadRemoteVirtualMic,
  unloadRemoteVirtualMic,
  startRemoteSpeechLoop,
  stopRemoteSpeechLoop,
  type RemoteHostConfig,
} from './remote-cdp-host.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const APP_HOST_ALIAS = 'meet140.localhost';
const APP_REAL_IP = '192.168.254.140';
const BASE_URL = `http://${APP_HOST_ALIAS}:4700`;
const HOST_RESOLVER_RULE = `MAP ${APP_HOST_ALIAS} ${APP_REAL_IP}`;

const REMOTE: RemoteHostConfig = {
  host: '192.168.254.123',
  user: 'silverjrom',
  chromePath: '/home/silverjrom/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
  cdpPort: 9339, // distinct from P3-LIVE-01 (9333) / -02 (9335) / -04 (9336) / -05 (9337) / -06 (9338)
  hostResolverRule: HOST_RESOLVER_RULE,
  xdgRuntimeDir: '/run/user/1000',
};
const REMOTE_MONITOR_SOURCE = 'alsa_output.pci-0000_2d_00.4.iec958-stereo.monitor';
const REMOTE_VIRTUAL_MIC = 'virtual_mic';
const REMOTE_OUTPUT_SINK = 'alsa_output.pci-0000_2d_00.4.iec958-stereo';
const BOT_140_WAV = path.join(HERE, '../fixtures/bot-speech/bot-140/hello.wav');
const BOT_123_WAV = path.join(HERE, '../fixtures/bot-speech/bot-123/hello.wav');
const EVIDENCE_DIR = path.join(
  HERE,
  '../../plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09/validation/p3-live-07-evidence',
);
const MIN_AVAIL_GI = 2;

function availableMemGi(): number {
  const line = execSync('free -b').toString().split('\n').find((l) => l.startsWith('Mem:'));
  if (!line) throw new Error('could not parse `free -b` output');
  const fields = line.trim().split(/\s+/);
  const availBytes = Number(fields[6]);
  return availBytes / 1024 ** 3;
}

async function main(): Promise<void> {
  const availGi = availableMemGi();
  console.log(`[P3-LIVE-07] .140 available memory: ${availGi.toFixed(2)}Gi`);
  if (availGi < MIN_AVAIL_GI) {
    console.error(
      `[P3-LIVE-07] BLOCKED: available memory ${availGi.toFixed(2)}Gi < ${MIN_AVAIL_GI}Gi threshold — refusing to launch (OOM protection).`,
    );
    process.exitCode = 2;
    return;
  }

  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  console.log('[P3-LIVE-07] Launching remote Chrome on .123 (headless; module-remap-source route)...');
  const remotePid = launchRemoteChrome(REMOTE);
  console.log(`[P3-LIVE-07] Remote chrome PID ${remotePid}`);

  let tunnel: Awaited<ReturnType<typeof openCdpTunnel>> | undefined;
  let virtualMicModuleId: string | undefined;
  let domWavPath: string | undefined;
  let domRms = 0;
  let senderSettingsResult: unknown;
  try {
    tunnel = await openCdpTunnel(REMOTE, REMOTE.cdpPort);
    console.log(`[P3-LIVE-07] CDP tunnel up on 127.0.0.1:${REMOTE.cdpPort}`);

    virtualMicModuleId = loadRemoteVirtualMic(REMOTE, REMOTE_MONITOR_SOURCE, REMOTE_VIRTUAL_MIC);
    console.log(`[P3-LIVE-07] Remote virtual_mic loaded (module ${virtualMicModuleId})`);

    setRemoteDefaultSource(REMOTE, REMOTE_VIRTUAL_MIC);
    console.log('[P3-LIVE-07] Remote default-source set to virtual_mic');

    const speechLoopPid = startRemoteSpeechLoop(REMOTE, BOT_123_WAV, REMOTE_OUTPUT_SINK);
    console.log(`[P3-LIVE-07] Remote speech loop started (pid ${speechLoopPid}) — mic is live before join`);

    try {
      const result = await joinDualBrowserCallSplitHost({
        baseUrl: BASE_URL,
        speaker1Name: 'bot-140',
        speaker2Name: 'bot-123',
        deviceMode: 'fake-device',
        fakeAudioPath: BOT_140_WAV,
        stimulus: 'speech',
        launchArgs: [`--host-resolver-rules=${HOST_RESOLVER_RULE}`],
        speaker2DeviceMode: 'real-virtual-mic',
        speaker2CdpEndpoint: `http://127.0.0.1:${REMOTE.cdpPort}`,
        speaker2ExtraQuery: 'e2eDisableAudioProcessing=1',
        acceptanceAttempt: false,
        onLive: async ({ page1: p1, page2: p2 }) => {
          const inT0 = await sampleInboundAudioStats(p1);
          console.log('[P3-LIVE-07] t0 inbound(page1):', JSON.stringify(inT0));

          const senderSettings = await p2.evaluate(() => {
            const w = window as any;
            const stream = w.__meetDebug?.localStream || null;
            const tracks: MediaStreamTrack[] = stream?.getAudioTracks?.() ?? [];
            const track = tracks[0] ?? null;
            return {
              trackFound: Boolean(track),
              settings: track?.getSettings ? track.getSettings() : null,
            };
          }).catch((e) => ({ error: String(e) }));
          senderSettingsResult = senderSettings;
          console.log('[P3-LIVE-07] bot-123 sender track settings (AGC/NS/EC should be false):', JSON.stringify(senderSettings));

          console.log('[P3-LIVE-07] Starting RAW remote-stream capture on page1 (bot-140, hears bot-123)...');
          const handle = await startRawRemoteStreamCapture(p1, EVIDENCE_DIR, 15000);
          console.log(`[P3-LIVE-07] Raw capture installed (captureId=${handle.captureId}); dwelling for voiced energy...`);
          await new Promise((r) => setTimeout(r, 6000));

          const inT1 = await sampleInboundAudioStats(p1);
          console.log('[P3-LIVE-07] t1 inbound(page1):', JSON.stringify(inT1));
          console.log(
            '[P3-LIVE-07] INBOUND DELTA:',
            JSON.stringify({
              deltaPackets: (inT1.packetsReceived || 0) - (inT0.packetsReceived || 0),
              deltaBytes: (inT1.bytesReceived || 0) - (inT0.bytesReceived || 0),
            }),
          );

          const capture = await stopDomRemoteAudioCapture(handle);
          domWavPath = capture.wavPath;
          domRms = capture.rms;
          console.log(
            `[P3-LIVE-07] Capture stopped: rms=${capture.rms.toFixed(6)} durationMs=${capture.durationMs.toFixed(0)} wav=${capture.wavPath}`,
          );
        },
      });

      console.log(
        '[P3-LIVE-07] Call result:',
        JSON.stringify(
          {
            roomId: result.roomId,
            duration: result.duration,
            speaker1: result.speaker1,
            speaker2: result.speaker2,
            domWavPath,
            domRms,
          },
          null,
          2,
        ),
      );

      fs.writeFileSync(
        path.join(EVIDENCE_DIR, 'p3-live-07-result.json'),
        JSON.stringify({ ...result, domWavPath, domRms, senderSettingsResult }, null, 2),
      );

      if (canDelete(result.roomId)) {
        const cookie = await authenticateHarness(BASE_URL);
        const del = await fetch(`${BASE_URL}/api/rooms/${result.roomId}`, {
          method: 'DELETE',
          headers: { Cookie: cookie },
        });
        console.log(`[P3-LIVE-07] Cleanup: room ${result.roomId} DELETE -> HTTP ${del.status}`);
      } else {
        console.log(`[P3-LIVE-07] Cleanup: room ${result.roomId} NOT deleted (canDelete=false — protected/unregistered)`);
      }

      const bothPublished = result.speaker1.publishedBytes > 0 && result.speaker2.publishedBytes > 0;
      const pass = bothPublished && domRms > 0;
      console.log(pass ? '[P3-LIVE-07] PASS' : '[P3-LIVE-07] FAIL');
    } finally {
      stopRemoteSpeechLoop(REMOTE, speechLoopPid);
    }
  } finally {
    if (virtualMicModuleId) {
      unloadRemoteVirtualMic(REMOTE, virtualMicModuleId);
      setRemoteDefaultSource(REMOTE, REMOTE_MONITOR_SOURCE);
      console.log('[P3-LIVE-07] Remote virtual_mic module unloaded, default-source restored.');
    }
    if (tunnel) closeCdpTunnel(tunnel);
    killRemoteChrome(REMOTE, remotePid);
    console.log('[P3-LIVE-07] Remote chrome + SSH tunnel torn down.');
  }
}

main().catch((err) => {
  console.error('[P3-LIVE-07] FAILED:', err);
  process.exitCode = 1;
});
