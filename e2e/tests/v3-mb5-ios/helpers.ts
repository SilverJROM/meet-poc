import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomFromDashboard, joinOwnerCall, type TestRoom } from '../../fixtures/rooms';

export const MB5_PREFIX = 'MB5IOS';
export const MB5_SCREENSHOT_DIR = '../plan/WK_0519/meet-v3-mobile/projcore-run-2026-05-19-v3-mobile/batch-5/screenshots';

export function prepareMb5Evidence(): void {
  fs.mkdirSync(path.resolve(process.cwd(), MB5_SCREENSHOT_DIR), { recursive: true });
}

export function cleanupMb5Artifacts(): void {
  cleanupRoomsByPrefix(MB5_PREFIX);
  cleanupRecordingsByPrefix(MB5_PREFIX);
}

export async function createAndJoinOwner(page: Page, suffix: string): Promise<TestRoom> {
  const room = await createRoomFromDashboard(page, `${MB5_PREFIX} ${suffix} ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');
  return room;
}

export async function installFakeMediaRecorder(page: Page, supportedMime: string, ua?: string): Promise<void> {
  await page.addInitScript(
    ({ supported, userAgent }) => {
      if (userAgent) {
        Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => userAgent });
        Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 5 });
      }
      class FakeMediaRecorder extends EventTarget {
        static isTypeSupported(type: string): boolean {
          return type === supported;
        }

        readonly mimeType: string;
        state: RecordingState = 'inactive';
        ondataavailable: ((event: BlobEvent) => void) | null = null;
        onstop: ((event: Event) => void) | null = null;

        constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
          super();
          this.mimeType = options?.mimeType || supported;
        }

        start(timeslice?: number): void {
          this.state = 'recording';
          window.__fakeRecorderTimeslice = timeslice ?? null;
        }

        stop(): void {
          if (this.state === 'inactive') return;
          this.state = 'inactive';
          const data = new Blob(['fake-audio'], { type: this.mimeType || supported });
          const dataEvent = new BlobEvent('dataavailable', { data });
          this.ondataavailable?.(dataEvent);
          this.dispatchEvent(dataEvent);
          const stopEvent = new Event('stop');
          setTimeout(() => {
            this.onstop?.(stopEvent);
            this.dispatchEvent(stopEvent);
          }, 0);
        }
      }

      Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: FakeMediaRecorder });
    },
    { supported: supportedMime, userAgent: ua },
  );
}

export async function recordOnce(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Record' }).click();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.isRecording)).toBe(true);
  const upload = page.waitForResponse((res) => res.url().endsWith('/upload') && res.request().method() === 'POST');
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await upload;
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.lastRecordingUpload?.file || '')).not.toBe('');
}

declare global {
  interface Window {
    __fakeRecorderTimeslice?: number | null;
  }
}
