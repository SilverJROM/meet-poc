import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createRoomViaApi } from '../../fixtures/rooms';
import { cleanupRoomsByPrefix } from '../../fixtures/db';
import {
  clearFaultRules,
  closeParticipants,
  dumpJson,
  ensureArtifactDirs,
  inboundAudioBytes,
  lastRecoveryEvent,
  loginAsJromExact,
  myParticipantId,
  SCREENSHOT_DIR,
  setFaultRuleForParticipant,
  setupNClients,
  waitForInboundAudioAdvancing,
  waitForSubscribedCount,
} from './helpers';

// R6a: 2-person recovery. A (host) + B (guest) join, both publish+subscribe audio (healthy baseline).
// B reconnects (real WS-drop → new CF session → new advertised track, same as B7's proven mechanism),
// which forces A to attempt a fresh subscribe to B's new track. A test-only fault rule makes THAT
// subscribe attempt 406 — the affected direction is A→B. The never-give-up ladder (R2-R5, already
// shipped/validated) must self-heal once the fault is cleared, with no test-only recovery shortcut.
const PREFIX = 'SFUB6A2P';

test.setTimeout(180_000);

test.beforeAll(() => {
  ensureArtifactDirs();
  cleanupRoomsByPrefix(PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(PREFIX);
});

test('B6a: 2-person — subscribe 406 on one direction self-heals to subscribed + advancing inbound audio', async ({
  browser,
  page,
  request,
}) => {
  await loginAsJromExact(page);
  const room = await createRoomViaApi(request, `${PREFIX} ${Date.now()}`);

  const participants = await setupNClients(browser, page, room.url, 1);
  const [host, guest] = participants;

  try {
    const hostParticipantId = await myParticipantId(host.page);
    const cfSessionIdBefore = await guest.page.evaluate(() => (window as any).__meetDebug?.sfuPublishState?.cfSessionId as string | null);
    expect(cfSessionIdBefore).toBeTruthy();

    // Block ONLY the host's subscribe-to-tracks calls (one direction) before forcing guest's reconnect.
    await setFaultRuleForParticipant(request, hostParticipantId);
    await guest.page.evaluate(() => (window as any).__meetDebug?.closeSignalingForTest?.());

    // Guest must reconnect with a NEW CF session (proves the reconnect actually happened).
    await expect
      .poll(
        () => guest.page.evaluate(() => (window as any).__meetDebug?.sfuPublishState?.cfSessionId as string | null),
        { timeout: 60_000, intervals: [1_000, 2_000, 2_000] },
      )
      .not.toBe(cfSessionIdBefore);

    // Host's subscribe attempt(s) to the new track must hit the injected 406 and drop it (not subscribed).
    await waitForSubscribedCount(host.page, 0, 30_000);

    // The never-give-up ladder must actually be engaging (subscribe-retry or beyond), not silently give up.
    await expect
      .poll(async () => (await lastRecoveryEvent(host.page))?.rung ?? null, { timeout: 20_000, intervals: [500, 1_000] })
      .not.toBeNull();
    const escalatingEvent = await lastRecoveryEvent(host.page);

    // Real self-heal: clear the fault, then let the EXISTING retry timers (not a test hook) recover.
    await clearFaultRules(request);

    await waitForSubscribedCount(host.page, 1, 60_000);
    await waitForInboundAudioAdvancing(host.page, 60_000);

    const recoveredEvent = await lastRecoveryEvent(host.page);
    dumpJson('b6a-two-person-recovery.json', {
      hostParticipantId,
      cfSessionIdBefore,
      escalatingEvent,
      recoveredEvent,
      hostInboundAudioBytesAfterRecovery: await inboundAudioBytes(host.page),
      hostSubscribedCountAfterRecovery: 1,
    });

    await host.page.screenshot({ path: path.resolve(process.cwd(), SCREENSHOT_DIR, 'b6a-recovered.png') });
  } finally {
    await closeParticipants(participants.slice(1));
    await clearFaultRules(request);
  }
});
