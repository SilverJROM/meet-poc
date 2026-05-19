import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { testRoomId } from './helpers';

test('S5.4 permission denied state shows retry placeholder', async ({ page }) => {
  await page.addInitScript(() => {
    const denied = new DOMException('Permission denied', 'NotAllowedError');
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => Promise.reject(denied),
        enumerateDevices: () => Promise.resolve([]),
      },
    });
  });
  const roomId = testRoomId();
  await loginAsJrom(page);
  await page.goto(`/room/${roomId}`);

  await expect(page.getByText(/Microphone access denied/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await page.screenshot({
    path: '../plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/batch-5/screenshots/lobby-permission-denied.png',
    fullPage: true,
  });
});
