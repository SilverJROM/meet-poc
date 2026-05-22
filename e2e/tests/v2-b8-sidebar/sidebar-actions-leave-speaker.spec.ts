import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  B8_SCREENSHOT_DIR,
  cleanupB8Artifacts,
  clickParticipantAction,
  createAndJoinOwner,
  admitBrowserGuest,
  addKnocker,
  installGeneratedAudioMedia,
  openParticipants,
  prepareB8Evidence,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  prepareB8Evidence();
  cleanupB8Artifacts();
});

test.afterAll(() => {
  cleanupB8Artifacts();
});

test('S8.1 sidebar opens and shows participants plus waiting knockers for host', async ({ browser, page }) => {
  const room = await createAndJoinOwner(page, 'sidebar-host');
  const guest = await admitBrowserGuest(browser, page, room, 'guest-a');
  const knocker = await addKnocker(browser, room, 'guest-waiting');

  await openParticipants(page);
  await expect(page.getByLabel('In the call').getByText('host (you)')).toBeVisible();
  await expect(page.getByLabel('In the call').getByText('guest-a')).toBeVisible();
  await expect(page.getByLabel('Waiting to join').getByText('guest-waiting')).toBeVisible();
  await expect(page.locator('.participant-toggle .count-badge')).toHaveText('2');
  await page.screenshot({ path: `${B8_SCREENSHOT_DIR}/sidebar-host-open.png`, fullPage: true });

  await guest.context.close();
  await knocker.context.close();
});

test('S8.2 non-host sidebar hides the waiting-to-join section', async ({ browser, page }) => {
  const room = await createAndJoinOwner(page, 'sidebar-non-host');
  const { guest, context } = await admitBrowserGuest(browser, page, room, 'guest-b');
  const knocker = await addKnocker(browser, room, 'guest-waiting');

  await openParticipants(guest);
  await expect(guest.getByLabel('In the call').getByText('host', { exact: true })).toBeVisible();
  await expect(guest.getByLabel('In the call').getByText('guest-b')).toBeVisible();
  await expect(guest.getByLabel('Waiting to join')).toHaveCount(0);
  await guest.screenshot({ path: `${B8_SCREENSHOT_DIR}/sidebar-non-host-open.png`, fullPage: true });

  await context.close();
  await knocker.context.close();
});

test('S8.3 host mute-participant mutes the target and updates the host tile', async ({ browser, page }) => {
  const room = await createAndJoinOwner(page, 'mute-participant');
  const { guest, context } = await admitBrowserGuest(browser, page, room, 'guest-muted');

  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.localStream?.getAudioTracks()[0]?.enabled)).toBe(true);
  await clickParticipantAction(page, 'guest-muted', 'Mute participant');
  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.localStream?.getAudioTracks()[0]?.enabled)).toBe(false);
  await expect(page.locator('app-tile').filter({ hasText: 'guest-muted' }).locator('.mute-icon')).toBeVisible();

  await context.close();
});

test('S8.4 host remove-participant kicks the target and removes their tile', async ({ browser, page }) => {
  const room = await createAndJoinOwner(page, 'remove-participant');
  const { guest, context } = await admitBrowserGuest(browser, page, room, 'guest-removed');

  await clickParticipantAction(page, 'guest-removed', 'Remove from meeting');
  await expect(page.locator('app-tile')).toHaveCount(1);
  await expect(guest).not.toHaveURL(new RegExp(`/room/${room.id}$`), { timeout: 3000 });

  await context.close();
});

test('S8.5/S8.6 host sees leave dialog while non-host leave is direct', async ({ browser, page }) => {
  const room = await createAndJoinOwner(page, 'leave-dialog');
  const { guest, context } = await admitBrowserGuest(browser, page, room, 'guest-leaves');

  await page.getByRole('button', { name: 'Leave call' }).click();
  await expect(page.getByRole('dialog', { name: 'Leave meeting' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'End meeting for everyone' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Leave but keep meeting going' })).toBeVisible();
  await page.screenshot({ path: `${B8_SCREENSHOT_DIR}/leave-dialog-visible.png`, fullPage: true });
  await page.getByRole('button', { name: 'Cancel' }).click();

  await guest.getByRole('button', { name: 'Leave call' }).click();
  await expect(guest.getByRole('dialog', { name: 'Leave meeting' })).toHaveCount(0);
  await expect(guest).toHaveURL(/\/login|\/app\/rooms/);

  await context.close();
});

test('S8.7 end for all flushes recording, navigates host, and shows guest toast', async ({ browser, page }) => {
  const room = await createAndJoinOwner(page, 'end-for-all-recording');
  const { guest, context } = await admitBrowserGuest(browser, page, room, 'guest-ended');

  await page.getByRole('button', { name: 'Record' }).click();
  await expect(page.locator('app-recording-banner')).toContainText('Host is recording');
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: 'Leave call' }).click();
  await expect(page.getByRole('dialog', { name: 'Leave meeting' })).toBeVisible();
  const uploadResponse = page.waitForResponse((res) => res.url().endsWith('/upload') && res.request().method() === 'POST');
  await page.getByRole('button', { name: 'End meeting for everyone' }).click();
  await expect(page.getByText('Finalizing meeting...')).toBeVisible();
  await page.screenshot({ path: `${B8_SCREENSHOT_DIR}/end-for-all-spinner.png`, fullPage: true });
  const upload = await uploadResponse;
  const uploadJson = await upload.json();
  const recordingPath = path.resolve('..', 'recordings', uploadJson.file);
  expect(fs.existsSync(recordingPath)).toBe(true);
  await expect(guest.getByRole('dialog', { name: 'The host ended this meeting' })).toBeVisible();
  await guest.screenshot({ path: `${B8_SCREENSHOT_DIR}/meeting-ended-toast.png`, fullPage: true });
  await expect(page).toHaveURL(/\/app\/rooms$/);

  await context.close();
});

test('S8.8 meeting-ended toast auto-dismisses and navigates the non-host', async ({ browser, page }) => {
  const room = await createAndJoinOwner(page, 'meeting-ended-auto');
  const { guest, context } = await admitBrowserGuest(browser, page, room, 'guest-auto');

  await page.getByRole('button', { name: 'Leave call' }).click();
  await page.getByRole('button', { name: 'End meeting for everyone' }).click();
  await expect(guest.getByRole('dialog', { name: 'The host ended this meeting' })).toBeVisible();
  await expect(guest).toHaveURL(/\/login|\/app\/rooms/, { timeout: 8000 });

  await context.close();
});

test('S8.9 active speaker highlights one remote tile and exposes 8Hz cadence', async ({ browser, page }) => {
  const room = await createAndJoinOwner(page, 'active-speaker');
  const context = await browser.newContext();
  const guest = await context.newPage();
  await installGeneratedAudioMedia(guest);
  await guest.goto(room.url);
  await guest.locator('#display-name').fill('speaker');
  await guest.getByRole('button', { name: 'Ask to join' }).click();
  await openParticipants(page);
  const row = page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'speaker' });
  await row.getByRole('button', { name: 'Admit' }).click();

  await expect(page.locator('app-tile').filter({ hasText: 'speaker' }).locator('.state')).toHaveText('connected', { timeout: 12000 });
  await page.evaluate(() => {
    const peer = window.__meetDebug?.peers.find((item) => item.name === 'speaker');
    if (!peer || !window.__meetDebug?.injectActiveSpeakerStream) throw new Error('speaker peer debug hook missing');
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
        data[index] = Math.sin(phase) * 0.35;
        phase += (2 * Math.PI * 440) / sampleRate;
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
    setInterval(writeFrame, 10);
    writeFrame();
    window.__meetDebug.injectActiveSpeakerStream(peer.id, new MediaStream([generator]));
  });
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.activeSpeakerHz || 0)).toBeGreaterThanOrEqual(6);
  await expect(page.locator('app-tile').filter({ hasText: 'speaker' }).locator('article.tile')).toHaveClass(/is-speaking/, { timeout: 10000 });
  const hz = await page.evaluate(() => window.__meetDebug?.activeSpeakerHz || 0);
  expect(hz).toBeLessThanOrEqual(10);
  await page.screenshot({ path: `${B8_SCREENSHOT_DIR}/active-speaker-highlight.png`, fullPage: true });

  await context.close();
});
