import fs from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall, type TestRoom } from '../../fixtures/rooms';

export const B8_PREFIX = 'B8SIDE';
export const B8_SCREENSHOT_DIR = '../plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/batch-8/screenshots';

export function prepareB8Evidence(): void {
  fs.mkdirSync(path.resolve(process.cwd(), B8_SCREENSHOT_DIR), { recursive: true });
}

export function cleanupB8Artifacts(): void {
  cleanupRoomsByPrefix(B8_PREFIX);
  cleanupRecordingsByPrefix(B8_PREFIX);
}

export async function createAndJoinOwner(page: Page, suffix: string, name = 'host'): Promise<TestRoom> {
  const room = await createRoomFromDashboard(page, `${B8_PREFIX} ${suffix} ${Date.now()}`);
  await joinOwnerCall(page, room, name);
  return room;
}

export async function admitBrowserGuest(browser: Browser, owner: Page, room: TestRoom, name = 'guest'): Promise<{ guest: Page; context: BrowserContext }> {
  const context = await browser.newContext();
  const guest = await context.newPage();
  await joinGuestAndWait(guest, room, name);
  await openParticipants(owner);
  const row = owner.getByLabel('Waiting to join').locator('li').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect(owner.locator('app-tile')).toHaveCount(2);
  return { guest, context };
}

export async function addKnocker(browser: Browser, room: TestRoom, name = 'knocker'): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await joinGuestAndWait(page, room, name);
  return { page, context };
}

export async function openParticipants(page: Page): Promise<void> {
  const sidebar = page.locator('app-participant-sidebar .participant-sidebar.open');
  if ((await sidebar.count()) === 0) {
    await page.getByRole('button', { name: 'Show participants' }).click();
  }
  await expect(page.locator('app-participant-sidebar .participant-sidebar.open')).toBeVisible();
}

export async function clickParticipantAction(page: Page, peerName: string, actionName: string): Promise<void> {
  await openParticipants(page);
  const row = page.getByLabel('In the call').locator('li').filter({ hasText: peerName });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: new RegExp(`Actions for .*${peerName}`) }).click();
  await page.getByRole('menuitem', { name: actionName }).click();
}

export async function installGeneratedAudioMedia(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices: async () => [
          { deviceId: 'generated-mic', groupId: 'generated', kind: 'audioinput', label: 'Generated microphone', toJSON: () => ({}) },
        ],
        getUserMedia: async () => {
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
          return new MediaStream([generator]);
        },
      },
    });
  });
}
