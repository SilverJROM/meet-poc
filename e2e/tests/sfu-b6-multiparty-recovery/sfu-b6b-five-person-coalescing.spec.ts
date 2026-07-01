import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createRoomViaApi } from '../../fixtures/rooms';
import { cleanupRoomsByPrefix } from '../../fixtures/db';
import {
  clearFaultRules,
  closeParticipants,
  collectRejoinEpochs,
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

// R6b: 5-person recovery + coalescing. A (host) + 4 guests, full mesh healthy baseline (4 subscribed
// mids each). A single fault rule blocks ALL of A's subscribe-tracks calls (one observer, blanket rule
// — no matchTrackName needed since new post-reconnect track names aren't known ahead of time). 3 of
// the 4 remote publishers reconnect near-simultaneously (real WS-drop, same mechanism as B6a/B7),
// giving A 3 simultaneous advertised-but-unsubscribed publishers. The recovery ladder's rung-3
// coalescing lock (B2b) must collapse this into exactly ONE full rejoin (epoch), not a rejoin storm —
// then the existing never-give-up ladder must recover all subscriptions once the fault clears.
const PREFIX = 'SFUB6B5P';
const GUEST_COUNT = 4;
const RECONNECT_COUNT = 3;

test.setTimeout(360_000);

test.beforeAll(() => {
  ensureArtifactDirs();
  cleanupRoomsByPrefix(PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(PREFIX);
});

test('B6b: 5-person — N simultaneous subscribe failures coalesce into ONE rejoin, then fully recover', async ({
  browser,
  page,
  request,
}) => {
  await loginAsJromExact(page);
  const room = await createRoomViaApi(request, `${PREFIX} ${Date.now()}`);

  const participants = await setupNClients(browser, page, room.url, GUEST_COUNT);
  const [host, ...guests] = participants;
  const reconnecting = guests.slice(0, RECONNECT_COUNT);

  try {
    const hostParticipantId = await myParticipantId(host.page);

    // Blanket rule: blocks ALL of the host's future subscribe-tracks calls, regardless of publisher.
    await setFaultRuleForParticipant(request, hostParticipantId);

    // Fire reconnects on 3 guests within the same tick — simultaneous advertised-not-subscribed.
    await Promise.all(
      reconnecting.map((g) => g.page.evaluate(() => (window as any).__meetDebug?.closeSignalingForTest?.())),
    );

    // Host must drop below full subscription count — the 3 reconnected publishers' new tracks fail.
    await expect
      .poll(() => host.page.evaluate(() => {
        const fn = (window as any).__meetDebug?.sfuSubscribedTracks;
        return typeof fn === 'function' ? Object.keys(fn() as Record<string, unknown>).length : -1;
      }), { timeout: 30_000, intervals: [500, 1_000] })
      .toBeLessThan(GUEST_COUNT);

    // Sample the recovery ladder for a window long enough to reach rung-3 (rung-1/2 are sub-second to
    // low-single-digit-second per publisher) but SHORTER than the ≥15s full-rejoin throttle window —
    // otherwise the (correct, never-give-up) throttled retry at ~15s would land in the same sample and
    // look like a second, uncoalesced rejoin. Confirms coalescing: exactly one epoch at 'sfu-rejoin'.
    const rejoinEpochs = await collectRejoinEpochs(host.page, 13_000);
    const rejoinTimeline = [...rejoinEpochs.entries()].sort((a, b) => a[1] - b[1]);

    dumpJson('b6b-rejoin-epochs-during-fault.json', { hostParticipantId, rejoinTimeline });
    expect(rejoinTimeline.length, `expected exactly one coalesced full rejoin, saw: ${JSON.stringify(rejoinTimeline)}`).toBe(1);

    // Real self-heal: clear the fault, then let the existing ladder recover everyone (no test hook).
    await clearFaultRules(request);

    await waitForSubscribedCount(host.page, GUEST_COUNT, 90_000);
    await waitForInboundAudioAdvancing(host.page, 60_000);

    const recoveredEvent = await lastRecoveryEvent(host.page);
    dumpJson('b6b-five-person-coalescing.json', {
      hostParticipantId,
      reconnectedGuestNames: reconnecting.map((g) => g.name),
      rejoinEpochs: [...rejoinEpochs],
      recoveredEvent,
      hostInboundAudioBytesAfterRecovery: await inboundAudioBytes(host.page),
      hostSubscribedCountAfterRecovery: GUEST_COUNT,
    });

    await host.page.screenshot({ path: path.resolve(process.cwd(), SCREENSHOT_DIR, 'b6b-recovered.png') });
  } finally {
    await closeParticipants(guests);
    await clearFaultRules(request);
  }
});
