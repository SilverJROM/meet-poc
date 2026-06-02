import { expect, type APIRequestContext, type Page, test } from '@playwright/test';
import path from 'node:path';
import { cleanupRoomsByPrefix } from '../../fixtures/db';
import { loginAsJrom } from '../../fixtures/auth';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

// Optional evidence sink (QA Rule 2). When B1_SHOTS_DIR is set, key state
// transitions are captured as PNGs for the validation report.
const SHOTS_DIR = process.env.B1_SHOTS_DIR;
async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS_DIR) return;
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: true });
}

// B1 — Host remote-audio playout: honest playability detection + AudioContext resume.
//
// HARNESS NOTE (NS5): two ephemeral Chromium contexts do NOT complete a mesh WebRTC
// peer connection in this headless sandbox (peer stays 'connecting', no remote
// stream ever arrives — confirmed via _diag), and the SFU path needs live Cloudflare
// credentials. So a remote *source* is mounted into the REAL mixer graph via the
// localhost-only __injectRemoteSourceForTest hook (mirroring active-speaker's
// injectDebugStream precedent). This exercises the genuine sources.size > 0
// running-required playability branch end-to-end through the actual service code,
// independent of flaky cross-context ICE. Real two-machine speaker proof is JROM's
// seat per NS5; these tests prove the playability decision + resume re-arm.
const B1_PREFIX = 'B1HOSTAUDIO';

type RemoteAudioSnap = {
  mixerEnabled: boolean;
  contextState: 'running' | 'suspended' | 'closed' | 'interrupted' | 'none';
  outputAttached: boolean;
  outputPaused: boolean;
  mutedAll: boolean;
  volume: number;
  mixedPeerIds: string[];
  mixedTrackIds: string[];
};

type B1MeetDebug = {
  remoteAudioMixer?: RemoteAudioSnap & {
    debugSnapshot?: () => RemoteAudioSnap;
    __suspendForTest?: () => Promise<void>;
    __injectRemoteSourceForTest?: (id: string, stream: MediaStream) => void;
    __removeRemoteSourceForTest?: (id: string) => void;
  };
  sfuGetStats?: () => Promise<RTCStatsReport | null>;
};

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  cleanupRoomsByPrefix(B1_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(B1_PREFIX);
});

test('E1: positive — context running, output unpaused, banner hidden', async ({ page, request }) => {
  test.setTimeout(60_000);
  await joinHostAlone(page, request, 'E1');
  await ensureRemoteAudioEnabled(page); // genuine gesture ⇒ resume-in-stack
  await injectRemoteSource(page, 'e1-src');

  await expect.poll(() => snap(page).then((s) => s.contextState), { timeout: 8_000 }).toBe('running');
  const s = await snap(page);
  expect(s.mixerEnabled).toBe(true);
  expect(s.contextState).toBe('running');
  expect(s.outputAttached).toBe(true);
  expect(s.outputPaused).toBe(false);
  expect(s.mixedPeerIds.length).toBeGreaterThan(0);
  await expect(page.locator('.audio-unblock-notice')).toHaveCount(0);
  await shot(page, 'E1-positive-running-banner-hidden');
});

test('E2: negative — sources + non-running context ⇒ Tap to enable audio banner', async ({ page, request }) => {
  test.setTimeout(60_000);
  await joinHostAlone(page, request, 'E2');
  await ensureRemoteAudioEnabled(page);
  await injectRemoteSource(page, 'e2-src');
  await expect.poll(() => snap(page).then((s) => s.mixedPeerIds.length), { timeout: 8_000 }).toBeGreaterThan(0);

  // Drive the live context into 'suspended' to model the autoplay-blocked reality;
  // the reactive playability effect surfaces the banner honestly (BUG-1 fix).
  await suspendContext(page);

  await expect.poll(() => snap(page).then((s) => s.contextState), { timeout: 8_000 }).not.toBe('running');
  expect((await snap(page)).mixedPeerIds.length).toBeGreaterThan(0);

  await expect(page.locator('.audio-unblock-notice')).toBeVisible();
  await expect(page.locator('.audio-unblock-notice')).toContainText('Tap to enable audio');
  await expect(page.getByRole('button', { name: 'Enable audio' })).toBeVisible();
  await shot(page, 'E2-negative-banner-shown');
});

test('E3: recovery — Enable audio gesture resumes context, clears banner', async ({ page, request }) => {
  test.setTimeout(60_000);
  await joinHostAlone(page, request, 'E3');
  await ensureRemoteAudioEnabled(page);
  await injectRemoteSource(page, 'e3-src');
  await expect.poll(() => snap(page).then((s) => s.mixedPeerIds.length), { timeout: 8_000 }).toBeGreaterThan(0);
  await suspendContext(page);
  await expect(page.locator('.audio-unblock-notice')).toBeVisible({ timeout: 8_000 });

  // Genuine gesture recovery — resume + mixer play() re-attempted (R1.3).
  await page.getByRole('button', { name: 'Enable audio' }).click();

  await expect.poll(() => snap(page).then((s) => s.contextState), { timeout: 8_000 }).toBe('running');
  await expect.poll(() => snap(page).then((s) => s.outputPaused), { timeout: 8_000 }).toBe(false);
  // Banner clears a beat after the resume settles (gesture sets remoteAudioBlocked
  // false only after output.play() resolves) — poll rather than assert instantly.
  await expect.poll(() => page.locator('.audio-unblock-notice').count(), { timeout: 8_000 }).toBe(0);
  await shot(page, 'E3-recovery-running-banner-cleared');
});

test('E4: source-add re-unlock — source added while context not running ⇒ banner, then gesture resumes', async ({ page, request }) => {
  test.setTimeout(60_000);
  await joinHostAlone(page, request, 'E4');

  // Host settled in-call with NO remote source yet.
  expect((await snap(page)).mixedPeerIds.length).toBe(0);

  // Drive context non-running, THEN add a source — the BUG-2 path where the
  // non-gesture setTimeout(0) re-unlock could not resume. The reactive playability
  // effect must surface the banner.
  await ensureRemoteAudioEnabled(page); // resume so we have a running context to suspend
  await suspendContext(page);
  await injectRemoteSource(page, 'e4-src');
  await expect.poll(() => snap(page).then((s) => s.mixedPeerIds.length), { timeout: 8_000 }).toBeGreaterThan(0);
  await expect.poll(() => snap(page).then((s) => s.contextState), { timeout: 8_000 }).not.toBe('running');
  await expect(page.locator('.audio-unblock-notice')).toBeVisible({ timeout: 8_000 });

  // User reacts to the banner with a genuine gesture ⇒ resume re-attempted.
  await page.getByRole('button', { name: 'Enable audio' }).click();
  await expect.poll(() => snap(page).then((s) => s.contextState), { timeout: 8_000 }).toBe('running');
  await expect.poll(() => snap(page).then((s) => s.outputPaused), { timeout: 8_000 }).toBe(false);
  await expect.poll(() => page.locator('.audio-unblock-notice').count(), { timeout: 8_000 }).toBe(0);
});

test('E5: no regression — stays playable; volume + mute-all work', async ({ page, request }) => {
  test.setTimeout(60_000);
  await joinHostAlone(page, request, 'E5');
  await ensureRemoteAudioEnabled(page);
  await injectRemoteSource(page, 'e5-src');
  await expect.poll(() => snap(page).then((s) => s.contextState), { timeout: 8_000 }).toBe('running');
  await expect(page.locator('.audio-unblock-notice')).toHaveCount(0);

  // Stays playable — no spurious re-block after settling.
  await page.waitForTimeout(3_000);
  {
    const s = await snap(page);
    expect(s.contextState).toBe('running');
    expect(s.outputPaused).toBe(false);
  }
  await expect(page.locator('.audio-unblock-notice')).toHaveCount(0);

  // Mute-all toggles via the speaker mute control (gain, NOT pause).
  await page.getByRole('button', { name: 'Mute meeting speakers' }).click();
  await expect.poll(() => snap(page).then((s) => s.mutedAll), { timeout: 5_000 }).toBe(true);
  {
    const s = await snap(page);
    expect(s.outputPaused).toBe(false); // mute is gain, not pause
    expect(s.contextState).toBe('running');
  }
  await expect(page.locator('.audio-unblock-notice')).toHaveCount(0);
  await page.getByRole('button', { name: 'Unmute meeting speakers' }).click();
  await expect.poll(() => snap(page).then((s) => s.mutedAll), { timeout: 5_000 }).toBe(false);
  expect((await snap(page)).outputPaused).toBe(false);

  // Volume — change via the popover slider; assert clamped reflection + still running.
  await page.getByRole('button', { name: 'Speaker volume' }).click();
  const slider = page.locator('input.volume-slider');
  await expect(slider).toBeVisible();
  await slider.fill('0.5');
  await slider.dispatchEvent('input');
  await expect.poll(() => snap(page).then((s) => Math.round(s.volume * 100) / 100), { timeout: 5_000 }).toBe(0.5);
  expect((await snap(page)).contextState).toBe('running');

  await expect(page.locator('.audio-unblock-notice')).toHaveCount(0);
});

test('E6: SOFT — host getStats jitterBufferEmittedCount climbs (or honest fake-media fallback)', async ({ page, request }) => {
  test.setTimeout(60_000);
  await joinHostAlone(page, request, 'E6');
  await ensureRemoteAudioEnabled(page);
  await injectRemoteSource(page, 'e6-src');
  await expect.poll(() => snap(page).then((s) => s.contextState), { timeout: 8_000 }).toBe('running');

  // SOFT (NS5 honesty clause): no live SFU/mesh inbound RTP exists in this harness
  // (injected synthetic source, no peer connection), so getStats has no inbound-audio
  // track to climb. This must NEVER fail the gate — we report honestly and fall back
  // to the debugSnapshot() running/unpaused proof as the rendered-audio proxy.
  const sampleEmitted = async (): Promise<number | null> =>
    page.evaluate(async () => {
      const d = (window as unknown as { __meetDebug?: B1MeetDebug }).__meetDebug;
      const report = await d?.sfuGetStats?.();
      if (!report) return null;
      let max: number | null = null;
      report.forEach((s: { type?: string; kind?: string; jitterBufferEmittedCount?: number }) => {
        if (s.type === 'inbound-rtp' && s.kind === 'audio' && typeof s.jitterBufferEmittedCount === 'number') {
          max = Math.max(max ?? 0, s.jitterBufferEmittedCount);
        }
      });
      return max;
    });

  const first = await sampleEmitted();
  await page.waitForTimeout(2_000);
  const second = await sampleEmitted();

  if (first !== null && second !== null && second > first) {
    console.log(`[E6 SOFT] jitterBufferEmittedCount climbed ${first} -> ${second}`);
    expect(second).toBeGreaterThan(first);
  } else {
    console.log(
      `[E6 SOFT] no live inbound-audio RTP under this harness (first=${first}, second=${second}); ` +
        `expected limitation — injected synthetic source has no peer connection. ` +
        `Falling back to snapshot proxy (running + unpaused). Real emitted-count climb is JROM's two-machine seat (NS5).`,
    );
    const s = await snap(page);
    expect(s.contextState).toBe('running');
    expect(s.outputPaused).toBe(false);
  }
});

// ---------- helpers ----------

async function joinHostAlone(page: Page, request: APIRequestContext, label: string): Promise<TestRoom> {
  await installHostMedia(page);
  const room = await createRoomViaApi(request, `${B1_PREFIX} ${label} ${Date.now()}`);
  await loginAsJrom(page);
  await page.goto(room.url + '?sfu=0');
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill('host-b1');
  await page.getByRole('button', { name: /^Join now$|^Join$/ }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
  await expect.poll(() => snap(page).then((s) => s.contextState !== 'none'), { timeout: 8_000 }).toBe(true);
  return room;
}

function snap(page: Page): Promise<RemoteAudioSnap> {
  return page.evaluate(() => {
    const d = (window as unknown as { __meetDebug?: B1MeetDebug }).__meetDebug;
    const mixer = d?.remoteAudioMixer;
    return (mixer?.debugSnapshot?.() ?? mixer) as RemoteAudioSnap;
  });
}

async function injectRemoteSource(page: Page, id: string): Promise<void> {
  await page.evaluate((sourceId) => {
    const d = (window as unknown as { __meetDebug?: B1MeetDebug }).__meetDebug;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const dest = ctx.createMediaStreamDestination();
    osc.connect(dest);
    osc.start();
    d?.remoteAudioMixer?.__injectRemoteSourceForTest?.(sourceId, dest.stream);
  }, id);
  await page.waitForTimeout(300);
}

async function suspendContext(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const d = (window as unknown as { __meetDebug?: B1MeetDebug }).__meetDebug;
    await d?.remoteAudioMixer?.__suspendForTest?.();
  });
  await page.waitForTimeout(400); // let the reactive playability effect run
}

async function ensureRemoteAudioEnabled(page: Page): Promise<void> {
  const enable = page.getByRole('button', { name: 'Enable audio' });
  if ((await enable.count()) > 0 && (await enable.isVisible())) await enable.click();
  await page.waitForTimeout(200);
}

async function installHostMedia(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const o = navigator.mediaDevices;
    const og = o.getUserMedia.bind(o);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        ...o,
        enumerateDevices: async () => [
          { kind: 'audioinput', deviceId: 'host-mic', label: 'Host Mic', groupId: 'g', toJSON() { return {}; } } as MediaDeviceInfo,
          { kind: 'audiooutput', deviceId: 'host-speaker', label: 'Host Speaker', groupId: 'g', toJSON() { return {}; } } as MediaDeviceInfo,
        ],
        getUserMedia: async (c: MediaStreamConstraints) => {
          const tracks: MediaStreamTrack[] = [];
          if (c.audio) { const s = await og({ audio: true, video: false }); tracks.push(s.getAudioTracks()[0]); }
          return new MediaStream(tracks);
        },
      },
    });
  });
}
