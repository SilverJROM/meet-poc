import fs from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { email, initialPassword } from '../../fixtures/auth';

export const SCREENSHOT_DIR = '../plan/WK_0701/projcore-run-2026-07-01/batch-B6/screenshots';
export const ARTIFACT_DIR = '../plan/WK_0701/projcore-run-2026-07-01/batch-B6';

export function ensureArtifactDirs(): void {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
}

export function dumpJson(name: string, data: unknown): void {
  fs.writeFileSync(path.resolve(process.cwd(), ARTIFACT_DIR, name), JSON.stringify(data, null, 2));
}

// See sfu-b2b-rejoin-ui/sfu-rejoin-ui.spec.ts for why this doesn't use the shared loginAsJrom().
export async function loginAsJromExact(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(initialPassword());
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/rooms$/);
}

export async function waitForPublished(page: Page, timeoutMs = 45_000): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => (window as any).__meetDebug?.sfuPublishState?.status), { timeout: timeoutMs })
    .toBe('published');
}

export async function myParticipantId(page: Page): Promise<string> {
  const id = await page.evaluate(() => (window as any).__meetDebug?.myParticipantId as string | null);
  if (!id) throw new Error('myParticipantId missing on __meetDebug');
  return id;
}

// Number of remote mids currently subscribed (audio-only join → 1 mid per remote peer).
export async function subscribedTrackCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const fn = (window as any).__meetDebug?.sfuSubscribedTracks;
    if (typeof fn !== 'function') return -1;
    return Object.keys(fn() as Record<string, unknown>).length;
  });
}

export async function waitForSubscribedCount(page: Page, count: number, timeoutMs = 90_000): Promise<void> {
  await expect
    .poll(() => subscribedTrackCount(page), { timeout: timeoutMs, intervals: [500, 1_000, 2_000] })
    .toBe(count);
}

export async function inboundAudioBytes(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const report: RTCStatsReport | null = await (window as any).__meetDebug?.sfuGetStats?.();
    if (!report) return 0;
    let bytes = 0;
    report.forEach((s: any) => {
      if (s.type === 'inbound-rtp' && s.kind === 'audio') bytes += s.bytesReceived ?? 0;
    });
    return bytes;
  });
}

export async function waitForInboundAudioAdvancing(page: Page, timeoutMs = 60_000): Promise<void> {
  const baseline = await inboundAudioBytes(page);
  await expect
    .poll(() => inboundAudioBytes(page), { timeout: timeoutMs, intervals: [1_000, 2_000, 3_000] })
    .toBeGreaterThan(baseline);
}

export type RecoveryEvent = {
  rung: string;
  publisherClientId: string;
  epoch: number;
  attempt: number;
  atMs: number;
} | null;

export async function lastRecoveryEvent(page: Page): Promise<RecoveryEvent> {
  return page.evaluate(() => (window as any).__meetDebug?.sfuLastRecoveryEvent?.() ?? null);
}

// Polls lastRecoveryEvent every ~200ms (far finer than the ≥15s full-rejoin throttle window) and
// records the first-seen atMs for every distinct epoch seen at rung 'sfu-rejoin' — the coalesced-
// full-rejoin marker (publisherClientId '*', not scoped to one peer). Used to prove N near-
// simultaneous failures collapse into ONE full rejoin (vs. a storm), while a throttled SECOND
// rejoin more than the ≥15s throttle window later is legitimate, not a storm.
export async function collectRejoinEpochs(page: Page, windowMs: number): Promise<Map<number, number>> {
  const epochs = new Map<number, number>();
  const deadline = Date.now() + windowMs;
  while (Date.now() < deadline) {
    const evt = await lastRecoveryEvent(page);
    if (evt && evt.rung === 'sfu-rejoin' && !epochs.has(evt.epoch)) epochs.set(evt.epoch, evt.atMs);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return epochs;
}

export async function setFaultRuleForParticipant(request: APIRequestContext, participantId: string): Promise<void> {
  const res = await request.post('/api/sfu/test-only/fault-inject-rules', {
    data: {
      rules: [
        {
          endpoint: 'tracks',
          matchParticipantId: participantId,
          // Only the subscribe direction — must not also break this participant's own publish.
          matchLocation: 'remote',
          status: 406,
          errorDescription: 'b6-e2e-fault-inject',
          errorCode: 'b6_e2e_fault',
        },
      ],
    },
  });
  expect(res.ok(), `fault-inject-rules set failed: ${res.status()} ${await res.text()}`).toBeTruthy();
}

export async function clearFaultRules(request: APIRequestContext): Promise<void> {
  const res = await request.post('/api/sfu/test-only/fault-inject-rules', { data: { rules: null } });
  expect(res.ok(), `fault-inject-rules clear failed: ${res.status()} ${await res.text()}`).toBeTruthy();
}

export type Participant = { ctx: BrowserContext | null; page: Page; name: string };

// A transient real CF session/publish hiccup (unrelated to our injected faults — plain network
// flakiness under rapid multi-context session creation) can auto-open the in-call device dialog
// (shouldOpenDeviceDialogOnAudioFail), which then intercepts clicks on the participants panel.
// Dismiss it defensively if it appears; it does not affect the underlying publish/recovery state.
async function dismissInCallDeviceDialogIfPresent(page: Page): Promise<void> {
  const closeBtn = page.getByRole('button', { name: 'Close device settings' });
  if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click();
}

// Host on `page` + `guestCount` guests each in their own browser context, all audio-only joined to
// `roomUrl` (?sfu=1) and mutually subscribed (each participant has `guestCount` remote mids — every
// prior SFU e2e hand-rolls this per-file; no shared join-N-clients fixture exists yet).
export async function setupNClients(browser: Browser, page: Page, roomUrl: string, guestCount: number): Promise<Participant[]> {
  await page.goto(roomUrl + '?sfu=1');
  await expect(page.locator('#display-name')).toBeVisible({ timeout: 10_000 });
  await page.locator('#display-name').fill('Host');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible({ timeout: 15_000 });
  await waitForPublished(page);
  await dismissInCallDeviceDialogIfPresent(page);
  await page.getByRole('button', { name: 'Show participants' }).click();

  const participants: Participant[] = [{ ctx: null, page, name: 'Host' }];

  for (let i = 0; i < guestCount; i += 1) {
    const name = `Guest${i + 1}`;
    const ctx = await browser.newContext();
    const guestPage = await ctx.newPage();
    await guestPage.goto(roomUrl + '?sfu=1');
    await expect(guestPage.locator('#display-name')).toBeVisible({ timeout: 10_000 });
    await guestPage.locator('#display-name').fill(name);
    await guestPage.getByRole('button', { name: 'Ask to join' }).click();
    await expect(guestPage.getByText(/Asking the host to admit you|The host is available/)).toBeVisible({ timeout: 10_000 });

    await dismissInCallDeviceDialogIfPresent(page);
    await page.getByLabel('Waiting to join').locator('li').filter({ hasText: name }).getByRole('button', { name: 'Admit' }).click();
    await expect(guestPage.locator('.call-panel')).toBeVisible({ timeout: 15_000 });
    await waitForPublished(guestPage);
    await dismissInCallDeviceDialogIfPresent(guestPage);
    participants.push({ ctx, page: guestPage, name });
  }

  for (const participant of participants) {
    await waitForSubscribedCount(participant.page, guestCount, 120_000);
  }

  return participants;
}

export async function closeParticipants(participants: Participant[]): Promise<void> {
  for (const participant of participants) {
    if (participant.ctx) await participant.ctx.close();
  }
}
