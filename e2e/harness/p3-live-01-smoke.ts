// P3-LIVE-01: first live SFU smoke, .140 <-> .123, split-host CDP-remote topology.
// bot-140 launches locally (fake-device + real speech WAV — .140 has no audio stack).
// bot-123 attaches via CDP to a Chrome process launched on .123 over SSH, routed through
// PipeWire's default-source so the OS mic Chrome opens is fed real, played-back speech
// (never a Chrome synthetic flag) — see remote-cdp-host.ts. NOT an acceptance attempt
// (no cap burn); short join+publish+receive-energy smoke only.
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
  startRemoteSpeechLoop,
  stopRemoteSpeechLoop,
  type RemoteHostConfig,
} from './remote-cdp-host.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// `.localhost`-suffixed alias for the app server (real IP 192.168.254.140), not the raw IP:
// Chrome treats any `*.localhost` origin as a secure context automatically, which a plain-http
// LAN-IP origin is not (navigator.mediaDevices is undefined there — see remote-cdp-host.ts).
// Node/nsswitch already resolves `*.localhost` to loopback (verified), which is correct here
// since the app really is on `.140`'s own loopback; both Chrome instances get an explicit
// --host-resolver-rules override below so this also works from `.123`, where loopback is wrong.
const APP_HOST_ALIAS = 'meet140.localhost';
const APP_REAL_IP = '192.168.254.140';
const BASE_URL = `http://${APP_HOST_ALIAS}:4700`;
const HOST_RESOLVER_RULE = `MAP ${APP_HOST_ALIAS} ${APP_REAL_IP}`;

const REMOTE: RemoteHostConfig = {
  host: '192.168.254.123',
  user: 'silverjrom',
  chromePath: '/home/silverjrom/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
  cdpPort: 9333,
  hostResolverRule: HOST_RESOLVER_RULE,
  xdgRuntimeDir: '/run/user/1000',
};
const REMOTE_MONITOR_SOURCE = 'alsa_output.pci-0000_2d_00.4.iec958-stereo.monitor';
const REMOTE_OUTPUT_SINK = 'alsa_output.pci-0000_2d_00.4.iec958-stereo';
const BOT_140_WAV = path.join(HERE, '../fixtures/bot-speech/bot-140/hello.wav');
const BOT_123_WAV = path.join(HERE, '../fixtures/bot-speech/bot-123/hello.wav');
const EVIDENCE_DIR = path.join(
  HERE,
  '../../plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09/validation/p3-live-01-evidence',
);
const MIN_AVAIL_GI = 2;

function availableMemGi(): number {
  const line = execSync('free -b').toString().split('\n').find((l) => l.startsWith('Mem:'));
  if (!line) throw new Error('could not parse `free -b` output');
  const fields = line.trim().split(/\s+/);
  const availBytes = Number(fields[6]); // Mem: total used free shared buff/cache available
  return availBytes / 1024 ** 3;
}

async function main(): Promise<void> {
  const availGi = availableMemGi();
  console.log(`[P3-LIVE-01] .140 available memory: ${availGi.toFixed(2)}Gi`);
  if (availGi < MIN_AVAIL_GI) {
    console.error(
      `[P3-LIVE-01] BLOCKED: available memory ${availGi.toFixed(2)}Gi < ${MIN_AVAIL_GI}Gi threshold — refusing to launch (OOM protection).`,
    );
    process.exitCode = 2;
    return;
  }

  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  console.log('[P3-LIVE-01] Launching remote Chrome on .123...');
  const remotePid = launchRemoteChrome(REMOTE);
  console.log(`[P3-LIVE-01] Remote chrome PID ${remotePid}`);

  let tunnel: Awaited<ReturnType<typeof openCdpTunnel>> | undefined;
  try {
    tunnel = await openCdpTunnel(REMOTE, REMOTE.cdpPort);
    console.log(`[P3-LIVE-01] CDP tunnel up on 127.0.0.1:${REMOTE.cdpPort}`);

    setRemoteDefaultSource(REMOTE, REMOTE_MONITOR_SOURCE);
    console.log('[P3-LIVE-01] Remote default-source set to monitor-of-output (virtual mic route)');

    const speechLoopPid = startRemoteSpeechLoop(REMOTE, BOT_123_WAV, REMOTE_OUTPUT_SINK);
    console.log(`[P3-LIVE-01] Remote speech loop started (pid ${speechLoopPid}) — mic is live before join`);

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
      });

      console.log(
        '[P3-LIVE-01] Call result:',
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
        fs.copyFileSync(result.receiveSideWavPath, path.join(EVIDENCE_DIR, 'p3-live-01-receive.wav'));
      }
      fs.writeFileSync(path.join(EVIDENCE_DIR, 'p3-live-01-result.json'), JSON.stringify(result, null, 2));

      if (canDelete(result.roomId)) {
        const cookie = await authenticateHarness(BASE_URL);
        const del = await fetch(`${BASE_URL}/api/rooms/${result.roomId}`, {
          method: 'DELETE',
          headers: { Cookie: cookie },
        });
        console.log(`[P3-LIVE-01] Cleanup: room ${result.roomId} DELETE -> HTTP ${del.status}`);
      } else {
        console.log(`[P3-LIVE-01] Cleanup: room ${result.roomId} NOT deleted (canDelete=false — protected/unregistered)`);
      }

      console.log(result.success ? '[P3-LIVE-01] PASS' : '[P3-LIVE-01] FAIL');
    } finally {
      stopRemoteSpeechLoop(REMOTE, speechLoopPid);
    }
  } finally {
    if (tunnel) closeCdpTunnel(tunnel);
    killRemoteChrome(REMOTE, remotePid);
    console.log('[P3-LIVE-01] Remote chrome + SSH tunnel torn down.');
  }
}

main().catch((err) => {
  console.error('[P3-LIVE-01] FAILED:', err);
  process.exitCode = 1;
});
