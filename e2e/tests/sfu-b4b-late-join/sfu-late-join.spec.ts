import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { createRoomViaApi } from '../../fixtures/rooms';

// 2-client late-join proof: A is established, B joins late, B sees A, B leaves, teardown verified
test.setTimeout(120_000);

async function enableCameraAndWait(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('input[name="cameraRequested"]').check();
  await expect
    .poll(() => page.evaluate(() => !!(window as any).__meetDebug?.localVideoTrackId), { timeout: 8_000 })
    .toBe(true);
}

async function waitForPublished(page: import('@playwright/test').Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => (window as any).__meetDebug?.sfuPublishState?.status), { timeout: 35_000 })
    .toBe('published');
}

async function waitForInboundMedia(page: import('@playwright/test').Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const report: RTCStatsReport | null = await (window as any).__meetDebug?.sfuGetStats?.();
          if (!report) return 0;
          let received = 0;
          report.forEach((s: any) => {
            if (s.type === 'inbound-rtp' && s.kind === 'audio') received += s.packetsReceived ?? 0;
          });
          return received;
        }),
      { timeout: 45_000, intervals: [1_000, 2_000, 2_000] },
    )
    .toBeGreaterThan(0);

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
      { timeout: 45_000, intervals: [1_000, 2_000, 2_000] },
    )
    .toBeGreaterThan(0);
}

async function remoteStreamCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => ((window as any).__meetDebug?.sfuRemoteStreams as Map<string, unknown> | undefined)?.size ?? -1);
}

test('B4b: late join subscribes to all present + leave tears down subscription (2-client SFU)', async ({ browser, page, request }) => {
  await loginAsJrom(page);
  const room = await createRoomViaApi(request, `SFU B4b Late Join ${Date.now()}`);

  // --- Host (A) joins and confirms published BEFORE B enters ---
  await page.goto(room.url + '?sfu=1');
  await expect(page.locator('#display-name')).toBeVisible({ timeout: 10_000 });
  await enableCameraAndWait(page);
  await page.locator('#display-name').fill('Host');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible({ timeout: 15_000 });
  await waitForPublished(page);

  // Open sidebar ready to admit
  await page.getByRole('button', { name: 'Show participants' }).click();

  // --- Guest B joins LATE (A already established + published) ---
  const guestBCtx = await browser.newContext();
  const guestB = await guestBCtx.newPage();
  await guestB.goto(room.url + '?sfu=1');
  await expect(guestB.locator('#display-name')).toBeVisible({ timeout: 10_000 });
  await enableCameraAndWait(guestB);
  await guestB.locator('#display-name').fill('Guest B');
  await guestB.getByRole('button', { name: 'Ask to join' }).click();
  await expect(guestB.getByText(/Asking the host to admit you|The host is available/)).toBeVisible({ timeout: 10_000 });

  // Host admits B
  await page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'Guest B' }).getByRole('button', { name: 'Admit' }).click();
  await expect(guestB.locator('.call-panel')).toBeVisible({ timeout: 15_000 });
  await waitForPublished(guestB);

  // Late-join proof: B sees A (B received A's roster snapshot and subscribed)
  await waitForInboundMedia(guestB);

  // A also receives B (bidirectional, proves live new-publisher pickup)
  await waitForInboundMedia(page);

  // Precondition: A has exactly 1 remote stream (B)
  await expect.poll(() => remoteStreamCount(page), { timeout: 10_000 }).toBe(1);

  // --- B explicitly leaves (sends 'leave' WS message → server broadcasts peer-left immediately, no grace period) ---
  await guestB.getByRole('button', { name: 'Leave call' }).click();

  // Teardown proof: A's remoteStreams drops to 0 — no ghost, subscription torn down
  await expect.poll(() => remoteStreamCount(page), { timeout: 15_000 }).toBe(0);

  await guestBCtx.close();
});
