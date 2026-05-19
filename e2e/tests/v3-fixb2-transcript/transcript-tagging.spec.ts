import fs from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix, recordingsDir } from '../../fixtures/db';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

const FIXB2_PREFIX = 'FIXB2META';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixb/batch-fixb2/screenshots';

type RecordingMeta = {
  schemaVersion: 1;
  sessionId: string;
  roomId: string;
  recordingDurationMs: number;
  participants: { clientId: string; displayName: string; isHost: boolean; joinedAtMs: number; leftAtMs: number | null }[];
  segments: { startMs: number; endMs: number; clientId: string; source: string }[];
};

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupFixb2Artifacts();
});

test.afterAll(() => {
  cleanupFixb2Artifacts();
});

test('FIX-B2.1 single-peer recording writes sidecar metadata', async ({ page, request }) => {
  const room = await createFixRoom(request, 'single-peer');
  await loginAsJrom(page);
  await joinOwner(page, room, 'host-one');

  const { file, meta } = await recordAndReadMeta(page, 3100);

  expect(fs.existsSync(path.join(recordingsDir(), file))).toBe(true);
  expect(fs.existsSync(path.join(recordingsDir(), `${file}.meta.json`))).toBe(true);
  expect(meta.schemaVersion).toBe(1);
  expect(meta.roomId).toBe(room.id);
  expect(meta.sessionId).toBeTruthy();
  expect(meta.participants).toHaveLength(1);
  expect(meta.participants[0]).toMatchObject({ displayName: 'host-one', isHost: true, joinedAtMs: 0, leftAtMs: null });
  expect(meta.recordingDurationMs).toBeGreaterThan(2500);
  expect(meta.recordingDurationMs).toBeLessThan(4500);
});

test('FIX-B2.2 two-peer recording captures both speakers in segments', async ({ browser, page, request }) => {
  const room = await createFixRoom(request, 'two-speaker');
  await loginAsJrom(page);
  await joinOwner(page, room, 'host-two');
  const guestContext = await joinGuest(browser, page, room, 'guest-two');

  await page.getByRole('button', { name: 'Record' }).click();
  await expect(page.locator('app-recording-banner')).toContainText('Host is recording');
  const ids = await peerIds(page, 'guest-two');
  await injectSpeaker(page, ids.host, 330, 0.24);
  await page.waitForTimeout(1400);
  await injectSpeaker(page, ids.guest, 660, 0.52);
  const { file, meta } = await stopAndReadMeta(page, 1800);

  expect(file).toContain(room.id);
  expect(meta.participants.map((p) => p.displayName)).toEqual(expect.arrayContaining(['host-two', 'guest-two']));
  expect(meta.segments.length).toBeGreaterThanOrEqual(2);
  const speakerIds = new Set(meta.segments.map((segment) => segment.clientId));
  expect(speakerIds.has(ids.host)).toBe(true);
  expect(speakerIds.has(ids.guest)).toBe(true);
  expect(meta.segments.reduce((total, segment) => total + (segment.endMs - segment.startMs), 0)).toBeGreaterThan(0);

  await guestContext.close();
});

test('FIX-B2.3 mid-recording peer leave is captured', async ({ browser, page, request }) => {
  const room = await createFixRoom(request, 'peer-leave');
  await loginAsJrom(page);
  await joinOwner(page, room, 'host-leave');
  const guestContext = await joinGuest(browser, page, room, 'guest-leave');

  await page.getByRole('button', { name: 'Record' }).click();
  await expect(page.locator('app-recording-banner')).toContainText('Host is recording');
  await page.waitForTimeout(1900);
  await guestContext.close();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.peers.some((peer) => peer.name === 'guest-leave') ?? true)).toBe(false);
  const { meta } = await stopAndReadMeta(page, 3100);

  const guest = meta.participants.find((participant) => participant.displayName === 'guest-leave');
  const host = meta.participants.find((participant) => participant.displayName === 'host-leave');
  expect(guest?.leftAtMs).toBeGreaterThan(1500);
  expect(guest?.leftAtMs).toBeLessThan(3000);
  expect(host?.leftAtMs).toBeNull();
});

test('FIX-B2.4 recordings list exposes hasMetadata and speakerCount', async ({ page, request }) => {
  const room = await createFixRoom(request, 'list-enrichment');
  const filename = `2026-05-19T12-00-00-000Z_${room.id}_${FIXB2_PREFIX}_list_111111.webm`;
  const dir = recordingsDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), Buffer.from('webm'));

  const metadata = {
    schemaVersion: 1,
    sessionId: 'list-session',
    roomId: room.id,
    recordingStartedAtIso: '2026-05-19T12:00:00.000Z',
    recordingDurationMs: 1000,
    participants: [
      { clientId: 'host', displayName: 'Host', isHost: true, joinedAtMs: 0, leftAtMs: null },
      { clientId: 'guest', displayName: 'Guest', isHost: false, joinedAtMs: 100, leftAtMs: 900 },
    ],
    segments: [],
  };
  const upload = await request.post('/api/recordings/upload-metadata', { data: { filename, metadata } });
  expect(upload.ok()).toBeTruthy();

  const listed = await request.get('/api/recordings');
  const json = await listed.json();
  const row = json.recordings.find((recording: { filename: string }) => recording.filename === filename);
  expect(row).toMatchObject({ hasMetadata: true, speakerCount: 2 });

  await loginAsJrom(page);
  await page.goto('/app/recordings');
  const uiRow = page.locator('.recording-row').filter({ hasText: filename }).first();
  await expect(uiRow).toContainText('Speakers: 2');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/recordings-with-meta-badge.png`, fullPage: true });
});

async function createFixRoom(request: APIRequestContext, suffix: string): Promise<TestRoom> {
  return createRoomViaApi(request, `${FIXB2_PREFIX} ${suffix} ${Date.now()}`);
}

async function joinOwner(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
}

async function joinGuest(browser: Browser, host: Page, room: TestRoom, name: string): Promise<BrowserContext> {
  const context = await browser.newContext();
  const guest = await context.newPage();
  await guest.goto(room.url);
  await guest.locator('#display-name').fill(name);
  await guest.getByRole('button', { name: 'Ask to join' }).click();
  const sidebar = host.locator('app-participant-sidebar .participant-sidebar.open');
  if ((await sidebar.count()) === 0) await host.getByRole('button', { name: 'Show participants' }).click();
  const row = host.getByLabel('Waiting to join').locator('li').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect.poll(() => host.evaluate((guestName) => window.__meetDebug?.peers.some((peer) => peer.name === guestName) ?? false, name)).toBe(true);
  return context;
}

async function recordAndReadMeta(page: Page, durationMs: number): Promise<{ file: string; meta: RecordingMeta }> {
  await page.getByRole('button', { name: 'Record' }).click();
  await expect(page.locator('app-recording-banner')).toContainText('Host is recording');
  return stopAndReadMeta(page, durationMs);
}

async function stopAndReadMeta(page: Page, durationMs: number): Promise<{ file: string; meta: RecordingMeta }> {
  await page.waitForTimeout(durationMs);
  const [uploadResponse, metadataResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().endsWith('/upload') && res.request().method() === 'POST'),
    page.waitForResponse((res) => res.url().endsWith('/api/recordings/upload-metadata') && res.request().method() === 'POST'),
    page.getByRole('button', { name: /Stop recording|Stop/ }).click(),
  ]);
  expect(metadataResponse.ok()).toBe(true);
  const uploadJson = await uploadResponse.json();
  const file = uploadJson.file as string;
  const meta = JSON.parse(fs.readFileSync(path.join(recordingsDir(), `${file}.meta.json`), 'utf8')) as RecordingMeta;
  return { file, meta };
}

async function peerIds(page: Page, guestName: string): Promise<{ host: string; guest: string }> {
  return page.evaluate((name) => {
    const peers = window.__meetDebug?.peers || [];
    const host = peers.find((peer) => peer.name.includes('(you)'))?.id;
    const guest = peers.find((peer) => peer.name === name)?.id;
    if (!host || !guest) throw new Error(`peer ids missing: ${JSON.stringify(peers)}`);
    return { host, guest };
  }, guestName);
}

async function injectSpeaker(page: Page, clientId: string, frequency: number, amplitude: number): Promise<void> {
  await page.evaluate(
    ({ id, tone, level }) => {
      if (!window.__meetDebug?.injectActiveSpeakerStream) throw new Error('active speaker debug hook missing');
      type TrackGenerator = new (init: { kind: 'audio' }) => MediaStreamTrack & { writable: WritableStream<AudioData> };
      const GeneratorCtor = (window as unknown as { MediaStreamTrackGenerator: TrackGenerator }).MediaStreamTrackGenerator;
      const generator = new GeneratorCtor({ kind: 'audio' });
      const writer = generator.writable.getWriter();
      const sampleRate = 48000;
      const frames = 480;
      const duration = Math.round((frames / sampleRate) * 1_000_000);
      let timestamp = 0;
      let phase = 0;
      const writeFrame = () => {
        const data = new Float32Array(frames);
        for (let index = 0; index < frames; index += 1) {
          data[index] = Math.sin(phase) * level;
          phase += (2 * Math.PI * tone) / sampleRate;
        }
        const audioData = new AudioData({
          format: 'f32',
          sampleRate,
          numberOfFrames: frames,
          numberOfChannels: 1,
          timestamp,
          duration,
          data,
        });
        timestamp += duration;
        void writer.write(audioData).finally(() => audioData.close());
      };
      window.setInterval(writeFrame, 10);
      writeFrame();
      window.__meetDebug.injectActiveSpeakerStream(id, new MediaStream([generator]));
    },
    { id: clientId, tone: frequency, level: amplitude },
  );
}

function cleanupFixb2Artifacts(): void {
  cleanupRoomsByPrefix(FIXB2_PREFIX);
  cleanupRecordingsByPrefix(FIXB2_PREFIX);
}
