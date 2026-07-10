// P3-LIVE-01: minimal SSH/CDP glue so one leg of a dual-browser call can run a
// real Chrome process on `.123` (the only host with a PipeWire virtual mic) while
// the harness/ledger/orchestration process stays on `.140`. CDP is never exposed
// on the LAN — the remote debugging port is loopback-only on `.123` and reached
// through an SSH -L tunnel from `.140`.
import { spawn, spawnSync, type ChildProcess, type SpawnSyncReturns } from 'node:child_process';

export interface RemoteHostConfig {
  host: string; // e.g. 192.168.254.123
  user: string; // e.g. silverjrom
  chromePath: string; // absolute path to a chrome/chromium binary on the remote host
  cdpPort: number; // loopback port on the remote host for --remote-debugging-port
  /**
   * `--host-resolver-rules` entry mapping a `*.localhost`-suffixed alias to the app server's
   * real LAN IP (e.g. `MAP meet140.localhost 192.168.254.140`). Chrome treats any `*.localhost`
   * hostname as a secure context automatically (no flag needed for that part); a plain LAN-IP
   * origin over http is NOT secure and leaves `navigator.mediaDevices` `undefined`, which fails
   * silently in the app as "Cannot read properties of undefined (reading 'getUserMedia')".
   * (`--unsafely-treat-insecure-origin-as-secure` was tried first and did not work on this
   * Chrome build — confirmed via `window.isSecureContext` staying `false`; the `.localhost`
   * alias route measured `isSecureContext: true`.)
   */
  hostResolverRule: string;
  /**
   * `XDG_RUNTIME_DIR` for the remote user's active desktop session (e.g. `/run/user/1000`).
   * A non-interactive `ssh user@host cmd` invocation does NOT inherit the graphical session's
   * environment, so Chrome's PulseAudio/PipeWire audio-capture client can't find the running
   * session's socket and `navigator.mediaDevices.enumerateDevices()` reports zero input devices
   * ("No microphone detected") even though `pactl`/`paplay` (which fall back to computing this
   * path from the caller's own uid) work fine over the same ssh connection without it.
   */
  xdgRuntimeDir: string;
}

/** Single-quotes a token for safe inclusion in the remote shell command string. */
function shellQuote(token: string): string {
  return `'${token.replace(/'/g, `'\\''`)}'`;
}

function ssh(config: RemoteHostConfig, remoteCommand: string): SpawnSyncReturns<string> {
  return spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', `${config.user}@${config.host}`, remoteCommand], {
    encoding: 'utf-8',
  });
}

/** Launches Chrome headless on the remote host with CDP bound to 127.0.0.1 only. Returns the remote PID. */
export function launchRemoteChrome(config: RemoteHostConfig): string {
  const profileDir = `/tmp/p3-live-01-chrome-profile-${Date.now()}`;
  const logPath = '/tmp/p3-live-01-chrome.log';
  const args = [
    '--headless=new',
    `--remote-debugging-port=${config.cdpPort}`,
    '--remote-debugging-address=127.0.0.1',
    '--use-fake-ui-for-media-stream', // auto-grant the permission prompt only — NOT a fake capture device
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--no-sandbox', // one-off headless launch outside Playwright's own launcher; no setuid helper installed for this cached binary
    `--user-data-dir=${profileDir}`,
    `--host-resolver-rules=${config.hostResolverRule}`,
  ].map(shellQuote).join(' ');
  const env = `XDG_RUNTIME_DIR=${shellQuote(config.xdgRuntimeDir)}`;
  const remoteCommand = `${env} nohup ${shellQuote(config.chromePath)} ${args} > ${logPath} 2>&1 & echo $!`;
  const result = ssh(config, remoteCommand);
  if (result.status !== 0) {
    throw new Error(`launchRemoteChrome failed (exit ${result.status}): ${result.stderr || result.stdout}`);
  }
  const pid = result.stdout.trim();
  if (!/^\d+$/.test(pid)) {
    throw new Error(`launchRemoteChrome: could not parse remote PID from output: ${JSON.stringify(result.stdout)}`);
  }
  return pid;
}

/** Kills the remote Chrome process by PID (best-effort; ignores already-exited). */
export function killRemoteChrome(config: RemoteHostConfig, pid: string): void {
  ssh(config, `kill ${pid} 2>/dev/null; sleep 0.3; kill -9 ${pid} 2>/dev/null; true`);
}

/** Opens `ssh -N -L localPort:127.0.0.1:remotePort` and resolves once the CDP endpoint answers. */
export async function openCdpTunnel(config: RemoteHostConfig, localPort: number): Promise<ChildProcess> {
  const tunnel = spawn(
    'ssh',
    ['-N', '-L', `${localPort}:127.0.0.1:${config.cdpPort}`, '-o', 'ExitOnForwardFailure=yes', `${config.user}@${config.host}`],
    { stdio: 'ignore' },
  );
  const deadline = Date.now() + 15_000;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${localPort}/json/version`);
      if (res.ok) return tunnel;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  tunnel.kill();
  throw new Error(`openCdpTunnel: CDP endpoint never came up on 127.0.0.1:${localPort} — ${lastErr}`);
}

export function closeCdpTunnel(tunnel: ChildProcess): void {
  tunnel.kill();
}

/** Sets the PipeWire default source on the remote host (the "virtual mic" route). */
export function setRemoteDefaultSource(config: RemoteHostConfig, sourceName: string): void {
  const result = ssh(config, `pactl set-default-source ${sourceName}`);
  if (result.status !== 0) {
    throw new Error(`setRemoteDefaultSource failed (exit ${result.status}): ${result.stderr || result.stdout}`);
  }
}

/**
 * Copies a local WAV to the remote host and starts a background loop that repeatedly plays it
 * through the given sink — this is the real, OS-routed "speech" the monitor-source virtual mic
 * captures (not a Chrome synthetic flag). Confirmed empirically (parecord on the monitor source):
 * the monitor is silent/near-empty with nothing playing (a one-shot `onLive`-timed play landed
 * AFTER the SFU's publish-bytes check had already given up, presumably to DTX on true silence) —
 * so this must be running BEFORE the browser opens its mic and stay running through the publish
 * check, not fired once after. Returns the remote loop's PID for cleanup via stopRemoteSpeechLoop.
 */
export function startRemoteSpeechLoop(config: RemoteHostConfig, localWavPath: string, sinkName: string): string {
  const remotePath = `/tmp/p3-live-01-speech-${Date.now()}.wav`;
  const scp = spawnSync('scp', ['-o', 'BatchMode=yes', localWavPath, `${config.user}@${config.host}:${remotePath}`], {
    encoding: 'utf-8',
  });
  if (scp.status !== 0) {
    throw new Error(`startRemoteSpeechLoop: scp failed (exit ${scp.status}): ${scp.stderr || scp.stdout}`);
  }
  const loopCmd = `while true; do paplay --device=${sinkName} ${remotePath}; sleep 0.3; done`;
  const remoteCommand = `nohup bash -c ${shellQuote(loopCmd)} > /tmp/p3-live-01-speech-loop.log 2>&1 & echo $!`;
  const result = ssh(config, remoteCommand);
  if (result.status !== 0) {
    throw new Error(`startRemoteSpeechLoop failed (exit ${result.status}): ${result.stderr || result.stdout}`);
  }
  const pid = result.stdout.trim();
  if (!/^\d+$/.test(pid)) {
    throw new Error(`startRemoteSpeechLoop: could not parse remote PID from output: ${JSON.stringify(result.stdout)}`);
  }
  return pid;
}

/** Stops the background speech loop (process group kill — the loop's own PID is the `bash -c` wrapper). */
export function stopRemoteSpeechLoop(config: RemoteHostConfig, pid: string): void {
  ssh(config, `pkill -P ${pid} 2>/dev/null; kill ${pid} 2>/dev/null; true`);
}
