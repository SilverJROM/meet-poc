// B08S-1: Dual-browser call driver harness
// Joins two browsers into a run-created room, validates join+publish, and books through CallLedger.
// Does NOT capture receive-side audio (B08S-2's role).

import type { Browser, BrowserContext, Page } from '@playwright/test';
import { chromium } from '@playwright/test';
import { initLedger, registerCreatedID, incrementCallBurn, getState } from './call-ledger.js';
import { ConversationScheduler, type ConversationScript } from './conversation-scheduler.js';

export interface CallDriverConfig {
  baseUrl: string; // e.g., http://localhost:4700
  roomId?: string; // If omitted, will create one
  speaker1Name: string; // e.g., 'bot-140'
  speaker2Name: string; // e.g., 'bot-123'
  autoAdmitRoom?: boolean;
  launchArgs?: string[]; // Chrome flags (e.g., for fake audio)
  ledgerBasePath?: string; // Path to store ledger state
}

export interface CallResult {
  roomId: string;
  sessionId?: string; // If captured from WS signaling
  duration: number; // milliseconds
  speaker1: { name: string; publishedBytes: number };
  speaker2: { name: string; publishedBytes: number };
  ledgerState: ReturnType<typeof getState>;
  success: boolean;
}

const DEFAULT_LAUNCH_ARGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
];

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

  // Sample outbound RTP bytes to verify publishing
  const publishedBytes = await page
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

  return { sessionId: sessionId as string | undefined, publishedBytes };
}

/**
 * Creates a room via API
 */
async function createRoom(baseUrl: string, title: string, autoAdmit = true): Promise<string> {
  const apiUrl = `${baseUrl}/api/rooms`;
  // In a real harness context, we'd use proper auth; for now assume dev/test auth or unauthenticated
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  initLedger(config.ledgerBasePath);

  const launchArgs = [...DEFAULT_LAUNCH_ARGS, ...(config.launchArgs || [])];
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

    // Browser 1
    context1 = await browser.newContext({ permissions: ['microphone', 'camera'] });
    page1 = await context1.newPage();
    const result1 = await joinBrowser(page1, roomUrl, config.speaker1Name);
    if (result1.sessionId) {
      registerCreatedID('session', result1.sessionId);
    }

    // Browser 2
    context2 = await browser.newContext({ permissions: ['microphone', 'camera'] });
    page2 = await context2.newPage();
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
