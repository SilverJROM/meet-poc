// B08S-1: Dual-browser call driver harness
// Joins two browsers into a run-created room, validates join+publish, and books through CallLedger.
// Does NOT capture receive-side audio (B08S-2's role).

import type { Browser, BrowserContext, Page } from '@playwright/test';
import { chromium } from '@playwright/test';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import { initLedger, registerCreatedID, incrementCallBurn, getState } from './call-ledger.js';
import { ConversationScheduler, type ConversationScript } from './conversation-scheduler.js';
import { startReceiveSideRecording, stopReceiveSideRecording, type CaptureHandle } from './receive-side-recorder.js';

// B00S-DEVICE: explicit device provenance — no implicit fake-device default.
export type DeviceMode = 'fake-device' | 'real-virtual-mic';
export type Stimulus = 'speech' | 'tone' | 'DC';

export interface CallProvenance {
  deviceMode: DeviceMode;
  stimulus?: Stimulus;
}

export interface CallDriverConfig {
  baseUrl: string; // e.g., http://localhost:4700
  roomId?: string; // If omitted, will create one
  speaker1Name: string; // e.g., 'bot-140'
  speaker2Name: string; // e.g., 'bot-123'
  autoAdmitRoom?: boolean;
  /**
   * B00S-DEVICE: REQUIRED, no default. `.140` has no audio stack (no pactl) —
   * 'real-virtual-mic' is only valid when running on `.123`
   * (see assertRealVirtualMicHost). 'fake-device' uses Chrome's synthetic
   * capture device, fed a real speech WAV via fakeAudioPath when hearability
   * matters (never a bare beep for hearability/transcript ACs).
   */
  deviceMode: DeviceMode;
  /** Provenance-only label for validation reports; not enforced against actual audio content. */
  stimulus?: Stimulus;
  /** fake-device only: WAV fed via --use-file-for-fake-audio-capture. */
  fakeAudioPath?: string;
  /** real-virtual-mic only: pactl source name to set as default-source before launch. */
  virtualMicSourceName?: string;
  launchArgs?: string[]; // Chrome flags (e.g., for fake audio)
  ledgerBasePath?: string; // Path to store ledger state
  recordReceiveSide?: boolean; // B08S-2: capture receive-side audio
  receiverPageIndex?: 0 | 1; // Which browser receives (0=speaker1, 1=speaker2, default 1)
  /**
   * B08A-3: optional mid-call hook, invoked once both browsers have joined and
   * publish-bytes validation has passed, BEFORE receive-side recording stops and
   * BEFORE the call burn increments. Lets a caller sample live stats (e.g.
   * sender-liveness) while the call is still up. Additive/backward-compatible:
   * omitting it changes nothing about existing behavior.
   */
  onLive?: (ctx: { page1: Page; page2: Page; roomId: string }) => Promise<void>;
}

export interface CallResult {
  roomId: string;
  sessionId?: string; // If captured from WS signaling
  duration: number; // milliseconds
  speaker1: { name: string; publishedBytes: number };
  speaker2: { name: string; publishedBytes: number };
  ledgerState: ReturnType<typeof getState>;
  success: boolean;
  receiveSideWavPath?: string; // B08S-2: receive-side audio WAV
  transcriptPath?: string; // B08S-2: transcript text file
  transcriptContent?: string; // B08S-2: full transcript (script-sourced)
  provenance: CallProvenance; // B00S-DEVICE: device_mode + stimulus for validation reports
}

// B00S-DEVICE: '--use-fake-device-for-media-stream' is NOT here anymore —
// it's added conditionally by buildLaunchArgs() only for deviceMode: 'fake-device'.
// A call without an explicit deviceMode must fail before ever reaching this list.
const DEFAULT_LAUNCH_ARGS = [
  '--use-fake-ui-for-media-stream',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--autoplay-policy=no-user-gesture-required', // GUARD 3 (B08S-2): AudioContext cannot start suspended
];

/** `.123` is the only host with a PipeWire virtual mic (B00S-DEVICE binding #3). */
const REAL_VIRTUAL_MIC_HOST_IP = '192.168.254.123';

/**
 * True when this process is running on the `.123` real-mic host: either an
 * explicit `MEET_REAL_MIC_HOST=123` env override (for a test runner that
 * knows it's on `.123`), or a local network interface carrying
 * 192.168.254.123.
 */
export function isOnRealMicHost(): boolean {
  if (process.env.MEET_REAL_MIC_HOST === '123') return true;
  const interfaces = os.networkInterfaces();
  return Object.values(interfaces).some((addrs) =>
    (addrs || []).some((addr) => addr.address === REAL_VIRTUAL_MIC_HOST_IP),
  );
}

/** Throws unless running on `.123` — real-virtual-mic is never valid elsewhere (`.140` has no audio stack). */
export function assertRealVirtualMicHost(): void {
  if (!isOnRealMicHost()) {
    throw new Error(
      `deviceMode 'real-virtual-mic' requires running on .123 (${REAL_VIRTUAL_MIC_HOST_IP}) — ` +
        `this host has no PipeWire virtual mic / pactl. Set MEET_REAL_MIC_HOST=123 only if you ` +
        `are actually running on that host.`,
    );
  }
}

/** Sets the PipeWire default source via pactl so Chrome's OS-default-input gUM picks up the virtual mic. */
function setVirtualMicDefaultSource(sourceName: string): void {
  const result = spawnSync('pactl', ['set-default-source', sourceName], { encoding: 'utf-8' });
  if (result.status !== 0) {
    throw new Error(
      `pactl set-default-source ${sourceName} failed (exit ${result.status}): ${result.stderr || result.stdout}`,
    );
  }
}

/**
 * Builds the Chrome launch args for a call, branching on the required
 * deviceMode. Exported for unit testing (pure function, no I/O besides the
 * real-virtual-mic host assertion / pactl call).
 */
export function buildLaunchArgs(config: CallDriverConfig): string[] {
  const args = [...DEFAULT_LAUNCH_ARGS, ...(config.launchArgs || [])];

  if (config.deviceMode === 'fake-device') {
    args.push('--use-fake-device-for-media-stream');
    if (config.fakeAudioPath) {
      args.push(`--use-file-for-fake-audio-capture=${config.fakeAudioPath}`);
    } else if (!args.some((a) => a.startsWith('--use-file-for-fake-audio-capture'))) {
      console.warn(
        '[B00S-DEVICE] fake-device with no fakeAudioPath/--use-file-for-fake-audio-capture — ' +
          "Chrome's default synthetic beep will be used, not real speech. Fine for join/publish " +
          'smoke; never claim hearability/transcript ACs from this call.',
      );
    }
  } else if (config.deviceMode === 'real-virtual-mic') {
    const sneakedFakeFlags = args.filter(
      (a) => a === '--use-fake-device-for-media-stream' || a.startsWith('--use-file-for-fake-audio-capture'),
    );
    if (sneakedFakeFlags.length > 0) {
      throw new Error(
        `[B00S-DEVICE] deviceMode 'real-virtual-mic' forbids fake-device flags in launchArgs, ` +
          `found: ${sneakedFakeFlags.join(', ')} — real-virtual-mic must use the OS default input, ` +
          `never Chrome's fake device. Remove these from launchArgs.`,
      );
    }
    assertRealVirtualMicHost();
    if (config.virtualMicSourceName) {
      setVirtualMicDefaultSource(config.virtualMicSourceName);
    }
    // Deliberately NOT pushing --use-fake-device-for-media-stream or
    // --use-file-for-fake-audio-capture — Chrome uses the OS default input,
    // which pactl (above) just pointed at the virtual mic.
  }

  return args;
}

/**
 * Handles preflight device check dialog
 */
async function handlePreflight(page: Page): Promise<void> {
  const openBtn = page.getByRole('button', { name: /Test \/ configure devices/i });
  if (await openBtn.count() > 0 && (await openBtn.first().isVisible().catch(() => false))) {
    await openBtn.first().click().catch(() => {});
    await page.waitForTimeout(400);
  }
  const confirmBtn = page.getByRole('button', { name: /Confirm — everything works|Check mic and speaker/i });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await confirmBtn.count() > 0) {
      const enabled = await confirmBtn.first().isEnabled().catch(() => false);
      if (enabled) {
        await confirmBtn.first().click().catch(() => {});
        break;
      }
    }
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(300);
}

/**
 * Joins a single browser to the room and validates join+publish
 */
async function joinBrowser(
  page: Page,
  roomUrl: string,
  displayName: string,
): Promise<{ sessionId?: string; publishedBytes: number }> {
  await page.goto(roomUrl).catch(() => {});
  await page.waitForTimeout(600);

  // Guest name overlay
  const guestNameInput = page.locator('#guest-display-name');
  if (await guestNameInput.count() > 0 && (await guestNameInput.isVisible().catch(() => false))) {
    await guestNameInput.fill(displayName).catch(() => {});
    await page.getByRole('button', { name: 'Continue' }).click().catch(() => {});
    await page.waitForTimeout(300);
  }

  await handlePreflight(page);

  // Display name
  const nameInput = page.locator('#display-name');
  if (await nameInput.count() > 0) await nameInput.fill(displayName).catch(() => {});

  // Join button
  const joinBtn = page.getByRole('button', { name: /Ask to join/i });
  const fallback = page.getByRole('button', { name: /^Join$/i });
  if (await joinBtn.count() > 0) {
    await joinBtn.first().click().catch(() => {});
  } else if (await fallback.count() > 0) {
    await fallback.first().click().catch(() => {});
  }
  await page.waitForTimeout(1200);

  // Capture session ID from WS or diagnostics if available
  const sessionId = await page
    .evaluate(() => {
      try {
        return (window as any).__meetDebug?.sessionId || null;
      } catch {
        return null;
      }
    })
    .catch(() => null);

  // B08A-3: ICE/DTLS/SFU negotiation is not instantaneous on a real server —
  // a single sample right after clicking join reads 0 (confirmed live: prior
  // single-shot sample got speaker1=0, speaker2=3 bytes). Poll instead of
  // sampling once.
  const publishedBytes = await waitForPublishedAudioBytes(page, 8000);

  return { sessionId: sessionId as string | undefined, publishedBytes };
}

/** Sample outbound RTP audio bytes over the current SFU connection. */
async function sampleOutboundAudioBytes(page: Page): Promise<number> {
  return page
    .evaluate(async () => {
      try {
        const stats = await (window as any).__meetDebug?.sfuGetStats?.();
        if (!stats) return 0;
        let totalBytes = 0;
        // RTCStatsReport is Map-like; use forEach for compatibility
        if (typeof stats.forEach === 'function') {
          stats.forEach((stat: any) => {
            if (stat.type === 'outbound-rtp' && (stat.kind ?? stat.mediaType) === 'audio') {
              totalBytes += stat.bytesSent || 0;
            }
          });
        } else {
          // Fallback for array-like stats
          for (const stat of stats) {
            if (stat.type === 'outbound-rtp' && (stat.kind ?? stat.mediaType) === 'audio') {
              totalBytes += stat.bytesSent || 0;
            }
          }
        }
        return totalBytes;
      } catch {
        return 0;
      }
    })
    .catch(() => 0);
}

/** Polls sampleOutboundAudioBytes until nonzero or timeoutMs elapses. */
async function waitForPublishedAudioBytes(page: Page, timeoutMs: number): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let latest = 0;
  while (Date.now() < deadline) {
    latest = await sampleOutboundAudioBytes(page);
    if (latest > 0) return latest;
    await new Promise((r) => setTimeout(r, 400));
  }
  return latest;
}

/**
 * B08A-3: authenticates against the real app using the project's own sanctioned
 * e2e credentials (same source as e2e/fixtures/auth.ts's loginAsJrom — the
 * single seeded dev user, jrom@silverjrom.app, password read from
 * INITIAL_PASSWORD.txt) and returns the `session` cookie value. POST /api/rooms
 * is auth-gated (requireAuth) — createRoom() below was previously unauthenticated
 * and 401s against a real server; this closes that gap with the same credential
 * the rest of the e2e suite already uses, not a new/invented bypass.
 */
async function authenticateHarness(baseUrl: string): Promise<string> {
  const { email, initialPassword } = await import('../fixtures/auth.js');
  const response = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: initialPassword() }),
  });
  if (!response.ok) {
    throw new Error(`Harness login failed: ${response.status} ${response.statusText}`);
  }
  const setCookie = response.headers.get('set-cookie');
  const match = setCookie?.match(/session=([^;]+)/);
  if (!match) {
    throw new Error('Harness login succeeded but no session cookie was returned');
  }
  return `session=${match[1]}`;
}

/**
 * Creates a room via API (authenticated — see authenticateHarness above).
 */
async function createRoom(baseUrl: string, title: string, autoAdmit = true): Promise<string> {
  const apiUrl = `${baseUrl}/api/rooms`;
  const cookie = await authenticateHarness(baseUrl);
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ title, autoAdmit }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create room: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as { room: { id: string } };
  return data.room.id;
}

/**
 * Main dual-browser call driver: joins two browsers to a room, validates join+publish,
 * and optionally runs a conversation script.
 */
export async function joinDualBrowserCall(
  config: CallDriverConfig,
  script?: ConversationScript,
): Promise<CallResult> {
  // B00S-DEVICE: belt-and-suspenders runtime guard alongside the TS-required
  // field — catches dynamic/JS callers that bypass the type system.
  if (!config.deviceMode) {
    throw new Error(
      "CallDriverConfig.deviceMode is required ('fake-device' | 'real-virtual-mic') — no default.",
    );
  }

  initLedger(config.ledgerBasePath);

  const launchArgs = buildLaunchArgs(config);
  const startTime = Date.now();

  let browser: Browser | undefined;
  let context1: BrowserContext | undefined;
  let context2: BrowserContext | undefined;
  let page1: Page | undefined;
  let page2: Page | undefined;

  try {
    // Create room if needed
    let roomId = config.roomId;
    if (!roomId) {
      roomId = await createRoom(config.baseUrl, `harness-${Date.now()}`, config.autoAdmitRoom !== false);
      registerCreatedID('room', roomId);
    } else {
      // Register even if provided (caller owns it but we're joining it)
      registerCreatedID('room', roomId);
    }

    const roomUrl = `${config.baseUrl}/room/${roomId}`;

    // Launch browser
    browser = await chromium.launch({ headless: true, args: launchArgs });

    // B08S-2: Prepare capture handle if needed (install hook BEFORE join)
    let captureHandle: CaptureHandle | undefined;
    if (config.recordReceiveSide) {
      const receiverPageIndex = config.recordReceiveSide ? (config.receiverPageIndex ?? 1) : 1;
      // Pre-allocate receiver context and page so we can install hook before join
      if (receiverPageIndex === 0) {
        context1 = await browser.newContext({ permissions: ['microphone', 'camera'] });
        page1 = await context1.newPage();
        captureHandle = await startReceiveSideRecording(page1, config.ledgerBasePath || process.cwd());
      } else {
        context2 = await browser.newContext({ permissions: ['microphone', 'camera'] });
        page2 = await context2.newPage();
        captureHandle = await startReceiveSideRecording(page2, config.ledgerBasePath || process.cwd());
      }
    }

    // Browser 1
    if (!context1) {
      context1 = await browser.newContext({ permissions: ['microphone', 'camera'] });
    }
    if (!page1) {
      page1 = await context1.newPage();
    }
    const result1 = await joinBrowser(page1, roomUrl, config.speaker1Name);
    if (result1.sessionId) {
      registerCreatedID('session', result1.sessionId);
    }

    // Browser 2
    if (!context2) {
      context2 = await browser.newContext({ permissions: ['microphone', 'camera'] });
    }
    if (!page2) {
      page2 = await context2.newPage();
    }
    const result2 = await joinBrowser(page2, roomUrl, config.speaker2Name);
    if (result2.sessionId) {
      registerCreatedID('session', result2.sessionId);
    }

    // If a script is provided, run it (optional conversation)
    if (script && page1 && page2) {
      const scheduler = new ConversationScheduler();

      // Playback function that would be called by scheduler
      // In a real scenario, this would trigger playback on the actual page contexts
      const playback = async () => {
        // Fire-and-forget playback; LLM brain is async-only
        // (Real implementation would need to inject audio via gUM or WebAudio)
      };

      await scheduler.schedule(script, playback);
    }

    // Validate both published
    const bytesAreGood =
      result1.publishedBytes > 0 && result2.publishedBytes > 0;
    if (!bytesAreGood) {
      throw new Error(
        `Publishing validation failed: speaker1=${result1.publishedBytes} bytes, speaker2=${result2.publishedBytes} bytes`,
      );
    }

    // B08A-3: mid-call hook — call is live, both sides published, recording (if any) still running.
    if (config.onLive && page1 && page2) {
      await config.onLive({ page1, page2, roomId });
    }

    // B08S-2: Stop recording after publish validation (AFTER both browsers have joined and published)
    let receiveSideResult: Awaited<ReturnType<typeof stopReceiveSideRecording>> | undefined;
    if (captureHandle) {
      const receiverPageIndex = config.receiverPageIndex ?? 1;
      const farEndSpeaker = receiverPageIndex === 0 ? config.speaker2Name : config.speaker1Name;
      const farEndSpeakerId = (farEndSpeaker === 'bot-140' ? 'bot-140' : 'bot-123') as
        | 'bot-140'
        | 'bot-123';

      receiveSideResult = await stopReceiveSideRecording(
        captureHandle,
        script,
        farEndSpeakerId,
      );
    }

    // Log the call burn
    incrementCallBurn();

    const duration = Date.now() - startTime;
    const ledgerState = getState();

    return {
      roomId,
      sessionId: result1.sessionId || result2.sessionId,
      duration,
      speaker1: { name: config.speaker1Name, publishedBytes: result1.publishedBytes },
      speaker2: { name: config.speaker2Name, publishedBytes: result2.publishedBytes },
      ledgerState,
      success: true,
      receiveSideWavPath: receiveSideResult?.wavPath,
      transcriptPath: receiveSideResult?.transcriptPath,
      transcriptContent: receiveSideResult?.transcriptContent,
      provenance: { deviceMode: config.deviceMode, stimulus: config.stimulus },
    };
  } catch (err) {
    incrementCallBurn();
    throw err;
  } finally {
    await page1?.close().catch(() => {});
    await page2?.close().catch(() => {});
    await context1?.close().catch(() => {});
    await context2?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

/**
 * Smoke test variant: joins both browsers, validates join+publish without full conversation.
 * Prefers 0 burn if join+publish alone suffices; registers as 1/25 if room join counts as a call.
 */
export async function dryRunDualBrowserCall(config: CallDriverConfig): Promise<CallResult> {
  // Identical to joinDualBrowserCall but without script execution
  return joinDualBrowserCall(config, undefined);
}
