import path from 'node:path';
import fs from 'node:fs';
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';
import { cleanupRoomsByPrefix } from '../../fixtures/db';

const B9_PREFIX = 'SFUB9DIAG';
const SCREENSHOT_DIR = '../plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/B9/screenshots';

// Real CF calls + ICE + diagnostics timer (7.5s interval) — generous timeout
test.setTimeout(120_000);

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(B9_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(B9_PREFIX);
});

test('B9: SFU diagnostics — outbound+inbound stats + subscribe latency persisted to meeting_session_diagnostics', async ({ browser, page, request }) => {
  await loginAsJrom(page);
  const room = await createRoomViaApi(request, `${B9_PREFIX} ${Date.now()}`);

  // --- Host joins with ?sfu=1 ---
  await page.goto(room.url + '?sfu=1');
  await expect(page.locator('#display-name')).toBeVisible({ timeout: 10_000 });
  await page.locator('input[name="cameraRequested"]').check();
  await expect.poll(() => page.evaluate(() => !!(window as any).__meetDebug?.localVideoTrackId), { timeout: 8_000 }).toBe(true);
  await page.locator('#display-name').fill('b9-host');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible({ timeout: 15_000 });

  // --- Guest joins ---
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(room.url + '?sfu=1');
  await expect(guest.locator('#display-name')).toBeVisible({ timeout: 10_000 });
  await guest.locator('input[name="cameraRequested"]').check();
  await expect.poll(() => guest.evaluate(() => !!(window as any).__meetDebug?.localVideoTrackId), { timeout: 8_000 }).toBe(true);
  await guest.locator('#display-name').fill('b9-guest');
  await guest.getByRole('button', { name: 'Ask to join' }).click();
  await expect(guest.getByText(/Asking the host to admit you|The host is available/)).toBeVisible({ timeout: 10_000 });

  // --- Host admits guest ---
  await page.getByRole('button', { name: 'Show participants' }).click();
  await page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'b9-guest' }).getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible({ timeout: 15_000 });

  // --- Wait for both to publish to CF ---
  await expect.poll(() => page.evaluate(() => (window as any).__meetDebug?.sfuPublishState?.status), { timeout: 35_000 }).toBe('published');
  await expect.poll(() => guest.evaluate(() => (window as any).__meetDebug?.sfuPublishState?.status), { timeout: 35_000 }).toBe('published');

  // --- Wait for inbound media on both sides (video framesDecoded > 0) ---
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const report: RTCStatsReport | null = await (window as any).__meetDebug?.sfuGetStats?.();
          if (!report) return 0;
          let decoded = 0;
          report.forEach((s: any) => { if (s.type === 'inbound-rtp' && s.kind === 'video') decoded += s.framesDecoded ?? 0; });
          return decoded;
        }),
      { timeout: 45_000, intervals: [1_000, 2_000, 2_000] },
    )
    .toBeGreaterThan(0);

  await expect
    .poll(
      () =>
        guest.evaluate(async () => {
          const report: RTCStatsReport | null = await (window as any).__meetDebug?.sfuGetStats?.();
          if (!report) return 0;
          let decoded = 0;
          report.forEach((s: any) => { if (s.type === 'inbound-rtp' && s.kind === 'video') decoded += s.framesDecoded ?? 0; });
          return decoded;
        }),
      { timeout: 45_000, intervals: [1_000, 2_000, 2_000] },
    )
    .toBeGreaterThan(0);

  // --- Poll until a diagnostics entry with sfuDiagnostics is persisted (one timer interval = 7.5s) ---
  const sfuEntry = await expect
    .poll(() => fetchSfuDiagEntry(request, room.title), { timeout: 30_000, intervals: [2_000, 3_000, 3_000] })
    .not.toBeNull();

  // The poll returned null or the entry — retrieve it to assert fields
  const entry = await fetchSfuDiagEntry(request, room.title);
  expect(entry).not.toBeNull();
  const sfu = entry!.sfuDiagnostics!;

  // (a) Publish stats present
  expect(sfu.outboundTracks.length).toBeGreaterThanOrEqual(1);

  // (b) Inbound stats for remote client present
  expect(sfu.inboundTracks.length).toBeGreaterThanOrEqual(1);

  // (c) CF candidate pair resolved
  expect(sfu.selectedCandidatePair).not.toBeNull();

  // (d) Subscribe latency recorded (ontrack fired → firstFrameAtMs set)
  expect(sfu.subscribeLatencies.length).toBeGreaterThanOrEqual(1);
  expect(sfu.subscribeLatencies[0].firstFrameAtMs).not.toBeNull();
  expect(sfu.subscribeLatencies[0].latencyMs).not.toBeNull();

  // (e) Connection states present
  expect(typeof sfu.connectionState).toBe('string');
  expect(typeof sfu.iceConnectionState).toBe('string');

  // --- Verify diagnostics page displays the SFU section ---
  const diagPage = await page.context().newPage();
  await diagPage.goto('/app/diagnostics');
  await expect(diagPage.getByRole('heading', { name: 'Call diagnostics', level: 2 })).toBeVisible();
  await diagPage.getByRole('button', { name: new RegExp(room.title) }).click();
  // SFU transport label appears in the SFU section
  await expect(diagPage.getByText('SFU transport').first()).toBeVisible({ timeout: 10_000 });
  await diagPage.screenshot({ path: `${SCREENSHOT_DIR}/sfu-diagnostics-page.png`, fullPage: true });
  await diagPage.close();

  await guestContext.close();
});

// --- Helpers ---

type SfuDiagEntry = {
  sfuDiagnostics: {
    cfSessionId: string;
    connectionState: string;
    iceConnectionState: string;
    rttMs: number | null;
    localCandidateType: string | null;
    remoteCandidateType: string | null;
    selectedCandidatePair: unknown | null;
    outboundTracks: { trackName: string; kind: string }[];
    inboundTracks: { publisherClientId: string; kind: string }[];
    subscribeLatencies: { publisherClientId: string; firstFrameAtMs: number | null; latencyMs: number | null }[];
  };
};

async function fetchSfuDiagEntry(request: APIRequestContext, roomTitle: string): Promise<SfuDiagEntry | null> {
  const listRes = await request.get('/api/meeting-sessions/diagnostics-log?page=1&pageSize=50');
  if (!listRes.ok()) return null;
  const list = (await listRes.json()) as { sessions: { id: string; roomTitle: string }[] };
  const session = list.sessions.find((s) => s.roomTitle === roomTitle);
  if (!session) return null;
  const detailRes = await request.get(`/api/meeting-sessions/${encodeURIComponent(session.id)}/diagnostics`);
  if (!detailRes.ok()) return null;
  const detail = (await detailRes.json()) as { entries: { payload: Record<string, unknown> }[] };
  const withSfu = detail.entries.find((e) => e.payload.sfuDiagnostics != null);
  if (!withSfu) return null;
  return withSfu.payload as SfuDiagEntry;
}
