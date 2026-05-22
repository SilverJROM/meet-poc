import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { createRoomViaApi } from '../../fixtures/rooms';

// SR-6 part 1: camera video published with 3 simulcast RID encodings (h/m/l)
test.setTimeout(180_000);

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

async function getVideoEncodings(page: import('@playwright/test').Page): Promise<{ rid?: string }[]> {
  return page.evaluate(() => {
    const fn = (window as any).__meetDebug?.sfuVideoEncodings;
    return fn ? fn() : [];
  });
}

async function waitForInboundVideoFrames(page: import('@playwright/test').Page): Promise<void> {
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
      { timeout: 60_000, intervals: [1_000, 2_000, 2_000] },
    )
    .toBeGreaterThan(0);
}

async function outboundVideoRtpCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(async () => {
    const report: RTCStatsReport | null = await (window as any).__meetDebug?.sfuGetStats?.();
    if (!report) return 0;
    let count = 0;
    report.forEach((s: any) => {
      if (s.type === 'outbound-rtp' && s.kind === 'video') count++;
    });
    return count;
  });
}

test('B6a: camera video published with simulcast encodings (h/m/l); 2-client regression (video flows)', async ({
  browser,
  page,
  request,
}) => {
  await loginAsJrom(page);
  const room = await createRoomViaApi(request, `SFU B6a Simulcast ${Date.now()}`);

  // --- Host (A) joins with camera on ---
  await page.goto(room.url + '?sfu=1');
  await expect(page.locator('#display-name')).toBeVisible({ timeout: 10_000 });
  await enableCameraAndWait(page);
  await page.locator('#display-name').fill('Host');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible({ timeout: 15_000 });
  await waitForPublished(page);

  // Assertion A: sender.getParameters().encodings has all three simulcast RIDs
  const encodings = await getVideoEncodings(page);
  expect(encodings).toHaveLength(3);
  const rids = encodings.map((e) => e.rid).sort();
  expect(rids).toEqual(['h', 'l', 'm']);

  // Assertion B: outbound-rtp has at least one video stream (simulcast publish active)
  // With fake media + CF, Chrome may activate 1-3 layers; assert >= 1 (regression guard)
  await expect
    .poll(() => outboundVideoRtpCount(page), { timeout: 15_000, intervals: [1_000, 2_000] })
    .toBeGreaterThanOrEqual(1);

  await page.getByRole('button', { name: 'Show participants' }).click();

  // --- Guest B joins with camera on ---
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

  // Assertion C: regression — both sides receive the other's video (simulcast offer didn't break CF subscribe)
  await waitForInboundVideoFrames(guestB); // B receives A's simulcast video
  await waitForInboundVideoFrames(page);   // A receives B's simulcast video

  await guestBCtx.close();
});
