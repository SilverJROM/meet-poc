import type { Page } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { openE2eDb, ownerEmail } from '../../fixtures/db';

export function testRoomId(): string {
  const db = openE2eDb();
  try {
    const row = db
      .prepare('SELECT id FROM rooms WHERE owner_email = ? AND title = ? ORDER BY created_at DESC LIMIT 1')
      .get(ownerEmail, 'TEST_ROOM01') as { id: string } | undefined;
    if (!row) throw new Error('TEST_ROOM01 not found');
    return row.id;
  } finally {
    db.close();
  }
}

export async function gotoOwnedLobby(page: Page): Promise<string> {
  const roomId = testRoomId();
  await loginAsJrom(page);
  await page.goto(`/room/${roomId}?sfu=0`);
  return roomId;
}

export async function lobbyTrackIds(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__meetDebug?.localStream?.getTracks().map((track) => track.id).sort() || []);
}
