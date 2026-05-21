import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { createRoomViaApi } from '../../fixtures/rooms';

// Real CF network calls + ICE setup — needs generous timeout
test.setTimeout(60_000);

test('B2: SFU client publishes audio+video to Cloudflare', async ({ page, request }) => {
  await loginAsJrom(page);
  const room = await createRoomViaApi(request, `SFU B2 Publish ${Date.now()}`);

  // ?sfu=1 flag triggers sfuClient.publish() in the admitted handler
  await page.goto(room.url + '?sfu=1');

  // Enable camera in the lobby so we get a video track alongside audio
  await expect(page.locator('#display-name')).toBeVisible({ timeout: 10_000 });
  await page.locator('input[name="cameraRequested"]').check();
  // Wait for the fake video track to be acquired
  await expect
    .poll(() => page.evaluate(() => !!(window as any).__meetDebug?.localVideoTrackId), { timeout: 5_000 })
    .toBe(true);

  await page.locator('#display-name').fill('SFU Tester');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible({ timeout: 15_000 });

  // (a) cfSessionId obtained — CF session was created
  await expect
    .poll(() => page.evaluate(() => (window as any).__meetDebug?.sfuPublishState?.cfSessionId), { timeout: 25_000 })
    .toBeTruthy();

  // (b) status reaches 'published'
  await expect
    .poll(() => page.evaluate(() => (window as any).__meetDebug?.sfuPublishState?.status), { timeout: 25_000 })
    .toBe('published');

  // (c) outbound-rtp stats exist for both audio and video — proves real RTP senders are active
  const kinds: string[] = await page.evaluate(async () => {
    const report: RTCStatsReport | null = await (window as any).__meetDebug?.sfuGetStats?.();
    if (!report) return [];
    const found: string[] = [];
    report.forEach((s: any) => {
      if (s.type === 'outbound-rtp' && s.kind) found.push(s.kind as string);
    });
    return found;
  });
  expect(kinds).toContain('audio');
  expect(kinds).toContain('video');
});
