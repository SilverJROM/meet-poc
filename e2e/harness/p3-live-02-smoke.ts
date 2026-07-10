// P3-LIVE-02: re-run of the P3-LIVE-01 split-host smoke with the real fix for .123's
// "0 audioinput" blocker. P3-LIVE-01's diagnosis (headless Chrome can't see input devices) was
// disproven empirically — headless AND Xvfb+non-headless both report 0 audioinput on the raw
// PipeWire monitor-of-sink route. The actual cause: Chrome's PulseAudio backend excludes
// `device.class=monitor` sources from mic enumeration by design. `module-remap-source` wraps the
// monitor in a new non-monitor source (`virtual_mic`) that Chrome does enumerate — see
// remote-cdp-host.ts `loadRemoteVirtualMic`. Chrome on .123 stays headless (no Xvfb needed).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { joinDualBrowserCallSplitHost, authenticateHarness } from './call-driver.js';
import { canDelete } from './call-ledger.js';
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
  cdpPort: 9335, // distinct from P3-LIVE-01's 9333 to avoid collision if that's ever rerun concurrently
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
  '../../plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09/validation/p3-live-02-evidence',
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
  console.log(`[P3-LIVE-02] .140 available memory: ${availGi.toFixed(2)}Gi`);
  if (availGi < MIN_AVAIL_GI) {
    console.error(
      `[P3-LIVE-02] BLOCKED: available memory ${availGi.toFixed(2)}Gi < ${MIN_AVAIL_GI}Gi threshold — refusing to launch (OOM protection).`,
    );
    process.exitCode = 2;
    return;
  }

  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  console.log('[P3-LIVE-02] Launching remote Chrome on .123 (headless — remap-source fixes enumeration, not headless-ness)...');
  const remotePid = launchRemoteChrome(REMOTE);
  console.log(`[P3-LIVE-02] Remote chrome PID ${remotePid}`);

  let tunnel: Awaited<ReturnType<typeof openCdpTunnel>> | undefined;
  let virtualMicModuleId: string | undefined;
  try {
    tunnel = await openCdpTunnel(REMOTE, REMOTE.cdpPort);
    console.log(`[P3-LIVE-02] CDP tunnel up on 127.0.0.1:${REMOTE.cdpPort}`);

    virtualMicModuleId = loadRemoteVirtualMic(REMOTE, REMOTE_MONITOR_SOURCE, REMOTE_VIRTUAL_MIC);
    console.log(`[P3-LIVE-02] Remote virtual_mic loaded (module ${virtualMicModuleId}) — wraps monitor as non-monitor source`);

    setRemoteDefaultSource(REMOTE, REMOTE_VIRTUAL_MIC);
    console.log('[P3-LIVE-02] Remote default-source set to virtual_mic');

    const speechLoopPid = startRemoteSpeechLoop(REMOTE, BOT_123_WAV, REMOTE_OUTPUT_SINK);
    console.log(`[P3-LIVE-02] Remote speech loop started (pid ${speechLoopPid}) — mic is live before join`);

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
        recordReceiveSide: true,
        receiverPageIndex: 0, // bot-140 (local) records what it receives from bot-123's real mic
        acceptanceAttempt: false,
        // Dwell so the receive-side capture hook has time to observe inbound audio before
        // stopReceiveSideRecording() runs. NOTE: as of this batch, the call itself (join+publish
        // both legs, server-confirmed) works, but receive-side capture throws INVALID_NO_PC —
        // a pre-existing, newly-discovered issue unrelated to the audioinput/Xvfb fix above; see
        // decisions/2026-07-10-p3-live-02-invalid-no-pc.md. The dwell is kept because it is
        // correct/needed once that separate issue is resolved.
        onLive: async () => {
          await new Promise((r) => setTimeout(r, 6000));
        },
      });

      console.log(
        '[P3-LIVE-02] Call result:',
        JSON.stringify(
          {
            roomId: result.roomId,
            duration: result.duration,
            speaker1: result.speaker1,
            speaker2: result.speaker2,
            receiveSideWavPath: result.receiveSideWavPath,
          },
          null,
          2,
        ),
      );

      if (result.receiveSideWavPath && fs.existsSync(result.receiveSideWavPath)) {
        fs.copyFileSync(result.receiveSideWavPath, path.join(EVIDENCE_DIR, 'p3-live-02-receive.wav'));
      }
      fs.writeFileSync(path.join(EVIDENCE_DIR, 'p3-live-02-result.json'), JSON.stringify(result, null, 2));

      if (canDelete(result.roomId)) {
        const cookie = await authenticateHarness(BASE_URL);
        const del = await fetch(`${BASE_URL}/api/rooms/${result.roomId}`, {
          method: 'DELETE',
          headers: { Cookie: cookie },
        });
        console.log(`[P3-LIVE-02] Cleanup: room ${result.roomId} DELETE -> HTTP ${del.status}`);
      } else {
        console.log(`[P3-LIVE-02] Cleanup: room ${result.roomId} NOT deleted (canDelete=false — protected/unregistered)`);
      }

      console.log(result.success ? '[P3-LIVE-02] PASS' : '[P3-LIVE-02] FAIL');
    } finally {
      stopRemoteSpeechLoop(REMOTE, speechLoopPid);
    }
  } finally {
    if (virtualMicModuleId) {
      unloadRemoteVirtualMic(REMOTE, virtualMicModuleId);
      setRemoteDefaultSource(REMOTE, REMOTE_MONITOR_SOURCE); // restore pre-test default-source
      console.log('[P3-LIVE-02] Remote virtual_mic module unloaded, default-source restored.');
    }
    if (tunnel) closeCdpTunnel(tunnel);
    killRemoteChrome(REMOTE, remotePid);
    console.log('[P3-LIVE-02] Remote chrome + SSH tunnel torn down.');
  }
}

main().catch((err) => {
  console.error('[P3-LIVE-02] FAILED:', err);
  process.exitCode = 1;
});
