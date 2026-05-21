import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { createRoomViaApi } from '../../fixtures/rooms';

// Real CF network calls + ICE + subscribe renegotiation — needs generous timeout
test.setTimeout(90_000);

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
  // Inbound audio: packetsReceived > 0
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

  // Inbound video: framesDecoded > 0
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

test('B4a: two SFU clients each receive audio+video from the other through Cloudflare', async ({ browser, page, request }) => {
  // page = host (logged-in as jrom), page2 = guest (unauthenticated)
  await loginAsJrom(page);
  const room = await createRoomViaApi(request, `SFU B4a Subscribe ${Date.now()}`);

  // --- Host joins ---
  await page.goto(room.url + '?sfu=1');
  await expect(page.locator('#display-name')).toBeVisible({ timeout: 10_000 });
  await enableCameraAndWait(page);
  await page.locator('#display-name').fill('Host');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible({ timeout: 15_000 });

  // --- Guest joins (separate browser context) ---
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(room.url + '?sfu=1');
  await expect(guest.locator('#display-name')).toBeVisible({ timeout: 10_000 });
  await enableCameraAndWait(guest);
  await guest.locator('#display-name').fill('Guest');
  await guest.getByRole('button', { name: 'Ask to join' }).click();
  await expect(guest.getByText(/Asking the host to admit you|The host is available/)).toBeVisible({ timeout: 10_000 });

  // --- Host admits guest ---
  await page.getByRole('button', { name: 'Show participants' }).click();
  await page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'Guest' }).getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible({ timeout: 15_000 });

  // --- Both publish to CF ---
  await waitForPublished(page);
  await waitForPublished(guest);

  // --- Core proof: each client receives the other's audio+video through CF ---
  await waitForInboundMedia(page);
  await waitForInboundMedia(guest);

  await guestContext.close();
});
