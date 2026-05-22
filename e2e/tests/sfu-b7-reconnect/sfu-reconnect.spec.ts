import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { createRoomViaApi } from '../../fixtures/rooms';

// SR-7: drop→reconnect (new CF session, no ghost tile) + deliberate exit (tile removed immediately)
// CF network + ICE + re-subscribe latency — generous timeout
test.setTimeout(300_000);

async function enableCameraAndWait(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('input[name="cameraRequested"]').check();
  await expect
    .poll(() => page.evaluate(() => !!(window as any).__meetDebug?.localVideoTrackId), { timeout: 8_000 })
    .toBe(true);
}

async function waitForPublished(page: import('@playwright/test').Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => (window as any).__meetDebug?.sfuPublishState?.status), { timeout: 45_000 })
    .toBe('published');
}

// sfuSubscribedTracks() is a function that reads the subscribedTracks signal directly (no zone needed).
// Returns number of mids A has currently subscribed. With audio+video from B → 2 mids. Ghost → 4 mids.
async function subscribedTrackCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const fn = (window as any).__meetDebug?.sfuSubscribedTracks;
    if (typeof fn !== 'function') return -1;
    const tracks = fn() as Record<string, unknown>;
    return Object.keys(tracks).length;
  });
}

async function waitForSubscribedCount(page: import('@playwright/test').Page, count: number, timeoutMs = 90_000): Promise<void> {
  await expect
    .poll(() => subscribedTrackCount(page), { timeout: timeoutMs, intervals: [1_000, 2_000, 3_000] })
    .toBe(count);
}

async function waitForInboundVideoFrames(page: import('@playwright/test').Page, timeoutMs = 90_000): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const report: RTCStatsReport | null = await (window as any).__meetDebug?.sfuGetStats?.();
          if (!report) return 0;
          let decoded = 0;
          report.forEach((s: any) => {
            if (s.type === 'inbound-rtp' && s.kind === 'video') decoded += s.framesDecoded ?? 0;
          });
          return decoded;
        }),
      { timeout: timeoutMs, intervals: [1_000, 2_000, 2_000] },
    )
    .toBeGreaterThan(0);
}

// Sets up two SFU clients (host A on `page`, guest B on returned page) in the given room.
// Waits for both to publish and for A to have subscribed to B's audio+video (2 mids).
async function setupTwoClients(
  browser: import('@playwright/test').Browser,
  page: import('@playwright/test').Page,
  roomUrl: string,
): Promise<{ guestCtx: import('@playwright/test').BrowserContext; guest: import('@playwright/test').Page }> {
  // Host A
  await page.goto(roomUrl + '?sfu=1');
  await expect(page.locator('#display-name')).toBeVisible({ timeout: 10_000 });
  await enableCameraAndWait(page);
  await page.locator('#display-name').fill('Host');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible({ timeout: 15_000 });
  await waitForPublished(page);
  await page.getByRole('button', { name: 'Show participants' }).click();

  // Guest B (separate browser context)
  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  await guest.goto(roomUrl + '?sfu=1');
  await expect(guest.locator('#display-name')).toBeVisible({ timeout: 10_000 });
  await enableCameraAndWait(guest);
  await guest.locator('#display-name').fill('Guest');
  await guest.getByRole('button', { name: 'Ask to join' }).click();
  await expect(guest.getByText(/Asking the host to admit you|The host is available/)).toBeVisible({ timeout: 10_000 });

  // Host admits guest
  await page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'Guest' }).getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible({ timeout: 15_000 });

  // Both publish to CF
  await waitForPublished(guest);

  // A must have subscribed to B: 2 mids (audio+video) in subscribedTracks.
  // sfuSubscribedTracks() reads the signal directly so it's reliable regardless of zone.
  await waitForSubscribedCount(page, 2, 120_000);

  return { guestCtx, guest };
}

test('B7-drop: reconnect creates new CF session, A sees B again with no ghost tile', async ({ browser, page, request }) => {
  await loginAsJrom(page);
  const room = await createRoomViaApi(request, `SFU B7 Reconnect ${Date.now()}`);

  const { guestCtx, guest } = await setupTwoClients(browser, page, room.url);

  // Record B's current cfSessionId — must change after reconnect
  const cfSessionIdBefore = await guest.evaluate(() => (window as any).__meetDebug?.sfuPublishState?.cfSessionId as string | null);
  expect(cfSessionIdBefore).toBeTruthy();

  // Simulate a drop on B: drops the ws connection.
  // Server starts reconnect grace → sends peer-reconnecting to A. B auto-reconnects via DR-37/38/39.
  await guest.evaluate(() => (window as any).__meetDebug?.closeSignalingForTest?.());

  // B must re-connect and re-publish with a NEW CF session (proves resetForReconnect ran)
  await expect
    .poll(
      () => guest.evaluate(() => (window as any).__meetDebug?.sfuPublishState?.cfSessionId as string | null),
      { timeout: 90_000, intervals: [1_000, 2_000, 2_000] },
    )
    .not.toBe(cfSessionIdBefore);

  await expect
    .poll(() => guest.evaluate(() => (window as any).__meetDebug?.sfuPublishState?.status), { timeout: 20_000 })
    .toBe('published');

  // A must have EXACTLY 2 subscribed tracks after reconnect (not 4 = ghost, not 0 = broken).
  // Ghost scenario: removePeer(oldClientId) not called → old 2 mids stay + new 2 mids added = 4.
  // Correct scenario: removePeer(oldClientId) called → old mids removed, new mids added = 2.
  await waitForSubscribedCount(page, 2, 180_000);

  // B also re-subscribed to A: 2 mids (after re-publish + roster re-subscribe)
  await waitForSubscribedCount(guest, 2, 120_000);

  await guestCtx.close();
});

test('B7-exit: deliberate leave removes B tile from A immediately', async ({ browser, page, request }) => {
  await loginAsJrom(page);
  const room = await createRoomViaApi(request, `SFU B7 Exit ${Date.now()}`);

  const { guestCtx, guest } = await setupTwoClients(browser, page, room.url);

  // B (non-host) clicks Leave — triggers directLeave(true) → peer-left → A removes subscription
  await guest.getByRole('button', { name: /leave/i }).click();

  // A's subscribed tracks for B must go to 0 (peer-left → tearDownPeerSubscription → close)
  await waitForSubscribedCount(page, 0, 15_000);

  await guestCtx.close();
});

test('B7-regression-B4a: two SFU clients each receive audio+video from the other', async ({ browser, page, request }) => {
  await loginAsJrom(page);
  const room = await createRoomViaApi(request, `SFU B7 B4a Regression ${Date.now()}`);

  const { guestCtx, guest } = await setupTwoClients(browser, page, room.url);

  // Both directions: inbound video frames received (getStats — always fresh, zone-independent)
  await Promise.all([waitForInboundVideoFrames(page, 90_000), waitForInboundVideoFrames(guest, 90_000)]);

  await guestCtx.close();
});
