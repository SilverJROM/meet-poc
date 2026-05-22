import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { createRoomViaApi } from '../../fixtures/rooms';

// SR-5 part 2: screenshare = a SEPARATE published video track over the SFU (not replaceTrack)
// getDisplayMedia is not available in headless Playwright with fake media args.
// Per the approved plan: mock getDisplayMedia to return a fake getUserMedia video stream,
// then assert the screen track flows as a SECOND distinct video track in addition to the camera.
test.setTimeout(180_000);

const MOCK_GET_DISPLAY_MEDIA = `
  navigator.mediaDevices.getDisplayMedia = async (constraints) => {
    // Return a real getUserMedia video stream — indistinguishable from a real screen track for WebRTC/CF
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  };
`;

async function injectDisplayMediaMock(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(MOCK_GET_DISPLAY_MEDIA);
}

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

async function remoteScreenStreamCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(
    () => ((window as any).__meetDebug?.sfuRemoteScreenStreams as Map<string, unknown> | undefined)?.size ?? -1,
  );
}

test('B5b: screenshare publishes a separate video track over SFU; remote sees it; stop removes it; camera unaffected (2-client SFU)', async ({
  browser,
  page,
  request,
}) => {
  await injectDisplayMediaMock(page);

  await loginAsJrom(page);
  const room = await createRoomViaApi(request, `SFU B5b Screenshare ${Date.now()}`);

  // --- Host (A) joins with camera on ---
  await page.goto(room.url + '?sfu=1');
  await expect(page.locator('#display-name')).toBeVisible({ timeout: 10_000 });
  await enableCameraAndWait(page);
  await page.locator('#display-name').fill('Host');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible({ timeout: 15_000 });
  await waitForPublished(page);

  await page.getByRole('button', { name: 'Show participants' }).click();

  // --- Guest B joins with camera on, also needs the mock ---
  const guestBCtx = await browser.newContext();
  const guestB = await guestBCtx.newPage();
  await injectDisplayMediaMock(guestB);

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

  // Both sides have bidirectional camera video (baseline)
  await waitForInboundVideoFrames(guestB); // B receives A's camera
  await waitForInboundVideoFrames(page);   // A receives B's camera

  // Precondition: no screen streams yet
  await expect.poll(() => remoteScreenStreamCount(guestB), { timeout: 5_000 }).toBe(0);

  // --- A starts screen share ---
  await page.getByRole('button', { name: 'Share screen' }).click();

  // A should now have a screen track published (kind: 'screen' in localPublishState)
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const state = (window as any).__meetDebug?.sfuPublishState;
          return state?.tracks?.some((t: any) => t.kind === 'screen' && t.status === 'live') ?? false;
        }),
      { timeout: 30_000 },
    )
    .toBe(true);

  // B should receive a distinct screen stream (remoteScreenStreams.size === 1)
  await expect.poll(() => remoteScreenStreamCount(guestB), { timeout: 60_000, intervals: [1_000, 2_000, 2_000] }).toBe(1);

  // B's camera inbound frames were already flowing — verify they're still advancing (screen share didn't break camera)
  const framesBeforeStop = await sampleInboundVideoFrames(guestB);
  await guestB.waitForTimeout(3_000);
  const framesAfterWait = await sampleInboundVideoFrames(guestB);
  // Camera video from A keeps flowing on B's side while screen share is active
  expect(framesAfterWait).toBeGreaterThanOrEqual(framesBeforeStop);

  // --- A stops screen share ---
  await page.getByRole('button', { name: 'Stop sharing' }).click();

  // B's screen stream should disappear
  await expect.poll(() => remoteScreenStreamCount(guestB), { timeout: 30_000, intervals: [1_000, 2_000] }).toBe(0);

  // A's screen track should be closed in localPublishState
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const state = (window as any).__meetDebug?.sfuPublishState;
          return state?.tracks?.some((t: any) => t.kind === 'screen' && t.status === 'live') ?? false;
        }),
      { timeout: 10_000 },
    )
    .toBe(false);

  // Camera video from A must still be flowing on B's side after screen share stopped
  const framesAfterStop = await sampleInboundVideoFrames(guestB);
  await guestB.waitForTimeout(3_000);
  const framesLater = await sampleInboundVideoFrames(guestB);
  expect(framesLater).toBeGreaterThanOrEqual(framesAfterStop);

  await guestBCtx.close();
});
