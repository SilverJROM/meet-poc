import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { createRoomViaApi } from '../../fixtures/rooms';

// SR-6 part 2: subscriber layer preference — mobile→'l', desktop→'h'; update doesn't break stream.
// Note: CF does not reflect the *served* RID in inbound-rtp stats in headless. We assert the
// subscribe REQUEST carried the correct preferredRid and that switching via update preserves flow.
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

function collectSubscribeRequests(page: import('@playwright/test').Page): any[] {
  const captured: any[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/sfu/tracks') && req.method() === 'POST') {
      try {
        const body = JSON.parse(req.postData() ?? '{}');
        // Only subscribe requests (location:remote) — ignore publish (location:local)
        if (body.tracks?.some((t: any) => t.location === 'remote')) captured.push(body);
      } catch {}
    }
  });
  return captured;
}

function collectUpdateResponses(page: import('@playwright/test').Page): { body: any; ok: boolean; status: number }[] {
  const captured: { body: any; ok: boolean; status: number }[] = [];
  page.on('response', (resp) => {
    if (resp.url().includes('/api/sfu/tracks/update') && resp.request().method() === 'PUT') {
      resp.json().then(
        (body) => captured.push({ body, ok: resp.ok(), status: resp.status() }),
        () => captured.push({ body: null, ok: resp.ok(), status: resp.status() }),
      );
    }
  });
  return captured;
}

test('B6b: subscribe preferredRid h(desktop) / l(mobile); update preserves stream', async ({
  browser,
  page,
  request,
}) => {
  await loginAsJrom(page);
  const room = await createRoomViaApi(request, `SFU B6b Layer Pref ${Date.now()}`);

  // Capture requests/responses BEFORE navigation so no events are missed
  const subscribeRequestsDesktop = collectSubscribeRequests(page);
  const updateResponsesDesktop = collectUpdateResponses(page);

  // --- Desktop A (host) joins with camera on ---
  await page.goto(room.url + '?sfu=1');
  await expect(page.locator('#display-name')).toBeVisible({ timeout: 10_000 });
  await enableCameraAndWait(page);
  await page.locator('#display-name').fill('Host');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible({ timeout: 15_000 });
  await waitForPublished(page);
  await page.getByRole('button', { name: 'Show participants' }).click();

  // --- Mobile B context: viewport 375×667 makes ViewportService.isMobile() → true ---
  const mobileBCtx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const mobileB = await mobileBCtx.newPage();

  const subscribeRequestsMobile = collectSubscribeRequests(mobileB);

  await mobileB.goto(room.url + '?sfu=1');
  await expect(mobileB.locator('#display-name')).toBeVisible({ timeout: 10_000 });
  await enableCameraAndWait(mobileB);
  await mobileB.locator('#display-name').fill('Mobile B');
  await mobileB.getByRole('button', { name: 'Ask to join' }).click();
  await expect(mobileB.getByText(/Asking the host to admit you|The host is available/)).toBeVisible({ timeout: 10_000 });

  // Host admits B
  await page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'Mobile B' }).getByRole('button', { name: 'Admit' }).click();
  await expect(mobileB.locator('.call-panel')).toBeVisible({ timeout: 15_000 });
  await waitForPublished(mobileB);

  // --- Assertion 1: desktop A's subscribe request for B's camera carried preferredRid:'h' ---
  // Subscribe request is made immediately on roster processing — before CF delivers frames.
  // Assert this first so layer-pref checks succeed even when CF is slow (resource contention).
  await expect
    .poll(
      () => subscribeRequestsDesktop.flatMap((b: any) => b.tracks ?? []).find((t: any) => t.location === 'remote' && t.preferredRid),
      { timeout: 60_000, intervals: [500, 1_000] },
    )
    .toBeTruthy();

  const desktopCamTrack = subscribeRequestsDesktop
    .flatMap((b: any) => b.tracks ?? [])
    .find((t: any) => t.location === 'remote' && t.preferredRid);
  expect(desktopCamTrack?.preferredRid).toBe('h');
  expect(desktopCamTrack?.ridNotAvailable).toBe('degrade');
  expect(desktopCamTrack?.priorityOrdering).toEqual(['h', 'm', 'l']);

  // --- Assertion 2: mobile B's subscribe request for A's camera carried preferredRid:'l' ---
  await expect
    .poll(
      () => subscribeRequestsMobile.flatMap((b: any) => b.tracks ?? []).find((t: any) => t.location === 'remote' && t.preferredRid),
      { timeout: 60_000, intervals: [500, 1_000] },
    )
    .toBeTruthy();

  const mobileCamTrack = subscribeRequestsMobile
    .flatMap((b: any) => b.tracks ?? [])
    .find((t: any) => t.location === 'remote' && t.preferredRid);
  expect(mobileCamTrack?.preferredRid).toBe('l');
  expect(mobileCamTrack?.ridNotAvailable).toBe('degrade');
  expect(mobileCamTrack?.priorityOrdering).toEqual(['l', 'm', 'h']);

  // --- Assertion 3: updateCameraLayer() resolves and PUT returns 2xx ---
  // Call via debug hook on desktop A (no screenshare active → should request 'h').
  // page.evaluate awaits the returned Promise — rejects if updateCameraLayer throws.
  await page.evaluate(() => (window as any).__meetDebug?.sfuUpdateCameraLayer?.());

  // Await the response (captured asynchronously after the request completes)
  await expect
    .poll(() => updateResponsesDesktop.length, { timeout: 15_000, intervals: [500, 1_000] })
    .toBeGreaterThan(0);

  const updateResp = updateResponsesDesktop[0];
  expect(updateResp.ok, `PUT /api/sfu/tracks/update failed: status=${updateResp.status}`).toBe(true);

  // --- Assertion 4: regression — video flows on both sides after layer update ---
  // Checked last so CF has maximum time to deliver frames even under resource pressure.
  await waitForInboundVideoFrames(page);
  await waitForInboundVideoFrames(mobileB);

  await mobileBCtx.close();
});
