// P3-LIVE-05: re-run of the P3-LIVE-04 split-host DOM-capture smoke, now with a PulseAudio
// null-sink (auto_null, PulseAudio's own hardware-fallback sink) present on .140. P3-LIVE-04
// proved the DOM captureStream mechanism works end-to-end but got exact digital silence; isolated
// to .140 having no audio backend at all. Confirmed live (isolation test, no SFU): a real two-PC
// loopback captureStream gets real signal (maxAbs~1.08) once PulseAudio is installed and running
// as a per-user session daemon — see decisions/2026-07-10-p3-live-02-invalid-no-pc.md P3-LIVE-05
// section. This script re-runs the full split-host smoke to confirm the fix holds under a real
// SFU call, not just the isolation test.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { joinDualBrowserCallSplitHost, authenticateHarness } from './call-driver.js';
import { canDelete } from './call-ledger.js';
import { startDomRemoteAudioCapture, stopDomRemoteAudioCapture } from './dom-audio-capture.js';
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
  cdpPort: 9337, // distinct from P3-LIVE-01 (9333) / P3-LIVE-02 (9335) / P3-LIVE-04 (9336)
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
  '../../plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09/validation/p3-live-05-evidence',
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
  console.log(`[P3-LIVE-05] .140 available memory: ${availGi.toFixed(2)}Gi`);
  if (availGi < MIN_AVAIL_GI) {
    console.error(
      `[P3-LIVE-05] BLOCKED: available memory ${availGi.toFixed(2)}Gi < ${MIN_AVAIL_GI}Gi threshold — refusing to launch (OOM protection).`,
    );
    process.exitCode = 2;
    return;
  }

  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  console.log('[P3-LIVE-05] Launching remote Chrome on .123 (headless; module-remap-source route)...');
  const remotePid = launchRemoteChrome(REMOTE);
  console.log(`[P3-LIVE-05] Remote chrome PID ${remotePid}`);

  let tunnel: Awaited<ReturnType<typeof openCdpTunnel>> | undefined;
  let virtualMicModuleId: string | undefined;
  let domWavPath: string | undefined;
  let domRms = 0;
  try {
    tunnel = await openCdpTunnel(REMOTE, REMOTE.cdpPort);
    console.log(`[P3-LIVE-05] CDP tunnel up on 127.0.0.1:${REMOTE.cdpPort}`);

    virtualMicModuleId = loadRemoteVirtualMic(REMOTE, REMOTE_MONITOR_SOURCE, REMOTE_VIRTUAL_MIC);
    console.log(`[P3-LIVE-05] Remote virtual_mic loaded (module ${virtualMicModuleId})`);

    setRemoteDefaultSource(REMOTE, REMOTE_VIRTUAL_MIC);
    console.log('[P3-LIVE-05] Remote default-source set to virtual_mic');

    const speechLoopPid = startRemoteSpeechLoop(REMOTE, BOT_123_WAV, REMOTE_OUTPUT_SINK);
    console.log(`[P3-LIVE-05] Remote speech loop started (pid ${speechLoopPid}) — mic is live before join`);

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
        acceptanceAttempt: false,
        onLive: async ({ page1: p1 }) => {
          console.log('[P3-LIVE-05] Starting DOM remote-audio capture on page1 (bot-140, hears bot-123)...');
          const handle = await startDomRemoteAudioCapture(p1, EVIDENCE_DIR, 15000);
          console.log(`[P3-LIVE-05] DOM capture installed (captureId=${handle.captureId}); dwelling for voiced energy...`);
          await new Promise((r) => setTimeout(r, 6000));
          const capture = await stopDomRemoteAudioCapture(handle);
          domWavPath = capture.wavPath;
          domRms = capture.rms;
          console.log(
            `[P3-LIVE-05] DOM capture stopped: rms=${capture.rms.toFixed(6)} durationMs=${capture.durationMs.toFixed(0)} wav=${capture.wavPath}`,
          );
          console.log('[P3-LIVE-05] elDiag:', JSON.stringify(capture.elDiag));
          const appDiag = await p1.evaluate(() => {
            const w = window as any;
            return w.__meetDebug?.remoteAudioMixer?.debugSnapshot ? w.__meetDebug.remoteAudioMixer.debugSnapshot() : w.__meetDebug?.remoteAudioMixer;
          });
          console.log('[P3-LIVE-05] app remoteAudioMixer debugSnapshot:', JSON.stringify(appDiag));
        },
      });

      console.log(
        '[P3-LIVE-05] Call result:',
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
        path.join(EVIDENCE_DIR, 'p3-live-05-result.json'),
        JSON.stringify({ ...result, domWavPath, domRms }, null, 2),
      );

      if (canDelete(result.roomId)) {
        const cookie = await authenticateHarness(BASE_URL);
        const del = await fetch(`${BASE_URL}/api/rooms/${result.roomId}`, {
          method: 'DELETE',
          headers: { Cookie: cookie },
        });
        console.log(`[P3-LIVE-05] Cleanup: room ${result.roomId} DELETE -> HTTP ${del.status}`);
      } else {
        console.log(`[P3-LIVE-05] Cleanup: room ${result.roomId} NOT deleted (canDelete=false — protected/unregistered)`);
      }

      const bothPublished = result.speaker1.publishedBytes > 0 && result.speaker2.publishedBytes > 0;
      const pass = bothPublished && domRms > 0;
      console.log(pass ? '[P3-LIVE-05] PASS' : '[P3-LIVE-05] FAIL');
    } finally {
      stopRemoteSpeechLoop(REMOTE, speechLoopPid);
    }
  } finally {
    if (virtualMicModuleId) {
      unloadRemoteVirtualMic(REMOTE, virtualMicModuleId);
      setRemoteDefaultSource(REMOTE, REMOTE_MONITOR_SOURCE);
      console.log('[P3-LIVE-05] Remote virtual_mic module unloaded, default-source restored.');
    }
    if (tunnel) closeCdpTunnel(tunnel);
    killRemoteChrome(REMOTE, remotePid);
    console.log('[P3-LIVE-05] Remote chrome + SSH tunnel torn down.');
  }
}

main().catch((err) => {
  console.error('[P3-LIVE-05] FAILED:', err);
  process.exitCode = 1;
});
