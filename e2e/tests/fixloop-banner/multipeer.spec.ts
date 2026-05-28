import { expect, test, type Page } from '@playwright/test';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall } from '../../fixtures/rooms';

test('fixloop multi-peer — four peers connect without host subscribe-stuck warnings', async ({ browser, page }) => {
  test.setTimeout(90_000);

  const hostSubscribeWarnings: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warning' && msg.text().includes('[sfu] subscribe stuck >10s')) {
      hostSubscribeWarnings.push(msg.text());
    }
  });

  const room = await createRoomFromDashboard(page, `MultiPeer ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestCount = 3;
  const guestContexts = await Promise.all(Array.from({ length: guestCount }, () => browser.newContext()));
  const guests = await Promise.all(guestContexts.map((context) => context.newPage()));

  try {
    await Promise.all(guests.map((guest, index) => joinGuestAndWait(guest, room, `Peer${index + 1}`)));

    await expect(page.locator('.knock-banner-row')).toHaveCount(guestCount, { timeout: 10_000 });
    for (let i = 0; i < guestCount; i += 1) {
      await page.locator('.knock-banner').getByRole('button', { name: 'Admit' }).first().click();
    }

    await Promise.all(guests.map((guest) => expect(guest.locator('.call-panel')).toBeVisible({ timeout: 12_000 })));

    const allPages = [page, ...guests];
    const expectedPeers = guestCount + 1;
    await Promise.all(allPages.map((participantPage) => waitForConnectedTiles(participantPage, expectedPeers)));

    await page.waitForTimeout(11_000);
    expect(hostSubscribeWarnings, hostSubscribeWarnings.join('\n')).toHaveLength(0);
  } finally {
    await Promise.all(guestContexts.map((context) => context.close()));
  }
});

async function waitForConnectedTiles(page: Page, expectedPeers: number): Promise<void> {
  // Each page sees one LOCAL tile (data-state="local") + (expectedPeers - 1) remote tiles
  // that should reach data-state="connected" once their RTP starts flowing.
  await expect(page.locator('app-tile')).toHaveCount(expectedPeers, { timeout: 20_000 });
  await expect(page.locator('.tile[data-state="local"]')).toHaveCount(1, { timeout: 20_000 });
  await expect
    .poll(async () => page.locator('.tile[data-state="connected"]').count(), { timeout: 20_000 })
    .toBe(expectedPeers - 1);
}
