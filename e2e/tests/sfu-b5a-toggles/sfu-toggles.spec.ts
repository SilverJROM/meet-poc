import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { createRoomViaApi } from '../../fixtures/rooms';

// SR-5 part 1: mic/cam toggles work over the SFU (replaceTrack, no renegotiation)
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

async function waitForInboundMedia(page: import('@playwright/test').Page): Promise<void> {
  // Video framesDecoded > 0 proves the SFU subscription is delivering media.
  // Audio packetsReceived is unreliable with fake media devices (Chrome reports 0 even when audio flows),
  // so we gate on video only; mic-mute is verified separately via media-state signaling.
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

async function sampleInboundVideoFrames(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(async () => {
    const report: RTCStatsReport | null = await (window as any).__meetDebug?.sfuGetStats?.();
    if (!report) return 0;
    let decoded = 0;
    report.forEach((s: any) => {
      if (s.type === 'inbound-rtp' && s.kind === 'video') decoded += s.framesDecoded ?? 0;
    });
    return decoded;
  });
}

test('B5a: cam-off stops remote video, cam-on resumes, mic-mute propagates; no renegotiation (2-client SFU)', async ({ browser, page, request }) => {
  await loginAsJrom(page);
  const room = await createRoomViaApi(request, `SFU B5a Toggles ${Date.now()}`);

  // --- Host (A) joins with camera on ---
  await page.goto(room.url + '?sfu=1');
  await expect(page.locator('#display-name')).toBeVisible({ timeout: 10_000 });
  await enableCameraAndWait(page);
  await page.locator('#display-name').fill('Host');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible({ timeout: 15_000 });
  await waitForPublished(page);

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

  // Both sides have bidirectional media (check B first — B gets roster snapshot on admit, subscribes faster)
  await waitForInboundMedia(guestB);  // B receives A's media
  await waitForInboundMedia(page);    // A receives B's media

  // --- Camera OFF: B turns camera off, A's framesDecoded stops advancing ---
  await guestB.getByRole('button', { name: 'Turn camera off' }).click();

  // Give CF a moment to stop forwarding then sample twice to prove delta is zero
  const frames1 = await sampleInboundVideoFrames(page);
  await page.waitForTimeout(3_500);
  const frames2 = await sampleInboundVideoFrames(page);
  expect(frames2 - frames1).toBeLessThan(10);

  // --- Camera ON: B turns camera on, A's framesDecoded resumes ---
  await guestB.getByRole('button', { name: 'Turn camera on' }).click();

  // Poll until a meaningful delta accumulates on A's side
  const framesBeforeResume = await sampleInboundVideoFrames(page);
  await expect
    .poll(async () => (await sampleInboundVideoFrames(page)) - framesBeforeResume, { timeout: 30_000, intervals: [1_500, 2_000, 2_000] })
    .toBeGreaterThan(15);

  // --- Mic mute: B mutes, A sees B's micEnabled = false ---
  await guestB.getByRole('button', { name: 'Mute microphone' }).click();

  const guestBClientId = await guestB.evaluate(() => (window as any).__meetDebug?.myClientId as string | null);
  expect(guestBClientId).toBeTruthy();

  await expect
    .poll(
      () =>
        page.evaluate(
          (bId) => {
            const peers: any[] = (window as any).__meetDebug?.peers ?? [];
            const bPeer = peers.find((p: any) => p.id === bId);
            return bPeer?.micEnabled ?? null;
          },
          guestBClientId,
        ),
      { timeout: 10_000 },
    )
    .toBe(false);

  // --- No renegotiation: both sides still 'published' ---
  const aStatus = await page.evaluate(() => (window as any).__meetDebug?.sfuPublishState?.status);
  const bStatus = await guestB.evaluate(() => (window as any).__meetDebug?.sfuPublishState?.status);
  expect(aStatus).toBe('published');
  expect(bStatus).toBe('published');

  await guestBCtx.close();
});
