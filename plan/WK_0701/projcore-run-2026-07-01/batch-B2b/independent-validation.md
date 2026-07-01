# Batch B2b — Independent Validation

Pending — this file is owned by the independent validator (3-agent topology, validator=codex55) per
the batch's plan handshake, and will be overwritten by that validator's report.

## B2b red-team

Dispatch marker: `DISPATCH-batch-B2b-validator-2536160-1782896082`

Role: adversarial validator. I tried to break the rung-3 full SFU rejoin / rung-4 visible unrecovered path against the five named regression classes.

### 1. Duplicate subscriptions — SAFE

Attack attempted: two publishers emit `needs-rejoin` in the same synchronous tick, a normal presence/effect-driven `subscribeIfNeeded()` races the rejoin's `subscribeAllAdvertisedRemotes()`, and the user mashes the Retry button while a rejoin is already active.

Why it holds:
- `subscribeIfNeeded()` skips existing guards, marks `subscribedClientIds` before enqueueing, and captures `recoveryEpoch` before the async subscribe starts (`frontend/src/app/services/sfu-client.service.ts:221-232`).
- The B2b rejoin entry point sets `rejoinScheduled` synchronously before starting the async rejoin, so same-tick `needs-rejoin` and Retry clicks collapse to one active `runFullSfuRejoin()` (`frontend/src/app/services/sfu-client.service.ts:415-426`).
- `subscribeAllAdvertisedRemotes()` snapshots advertised publishers, checks epoch before each publisher, skips any `subscribedClientIds` already claimed by a racing subscribe path, marks before await, and serializes the actual PC mutation through `enqueue()` (`frontend/src/app/services/sfu-client.service.ts:489-515`).
- `doSubscribeTracks()` filters already-subscribed track names using both `midToEntry` and `subscribedTracks()` (`frontend/src/app/services/sfu-client.service.ts:1597-1605`, `frontend/src/app/services/sfu-client.service.ts:2180-2181`).

Test honesty: the new coordinator spec asserts exact outcome, not just call presence: same-tick Bob+Alice trigger exactly one handler and both POSTs happen (`frontend/src/app/services/sfu-recovery-coordinator.spec.ts:442-453`); a raced Alice guard produces only Bob's POST (`frontend/src/app/services/sfu-recovery-coordinator.spec.ts:487-502`).

### 2. Ghost / orphan remote streams — SAFE

Attack attempted: an old subscribe/ontrack completes after `resetForTransportRecovery()`, or a publisher rotates while stale stream/audio element state survives.

Why it holds:
- `resetForTransportRecovery()` calls `clearLocalTransportSessionState()`, which closes the old PC, clears `subscribedClientIds`, `midToEntry`, `pendingOntrack`, recovery timers/watchdogs, bumps `recoveryEpoch`, and replaces `remoteStreams`, `remoteScreenStreams`, `remoteTrackNames`, and `subscribedTracks` with fresh maps (`frontend/src/app/services/sfu-client.service.ts:888-916`).
- `doSubscribeTracks()` performs both stale remote `cfSessionId` and stale local `recoveryEpoch` guards before binding responses (`frontend/src/app/services/sfu-client.service.ts:2235-2271`; guard definition `frontend/src/app/services/sfu-recovery-epoch.ts:9-15`).
- `RemoteAudioService.syncPeers()` removes registry entries no longer represented in the current peer stream set, and replaces same-peer changed stream/track entries by calling `addPublisher()` (`frontend/src/app/services/remote-audio.service.ts:296-319`). `addPublisher()` first removes any existing publisher entry and appends one hidden `<audio>` element for the new stream (`frontend/src/app/services/remote-audio.service.ts:488-537`); stale async add continuations destroy themselves if no longer current (`frontend/src/app/services/remote-audio.service.ts:540-572`, `frontend/src/app/services/remote-audio.service.ts:648-660`).

Test honesty: epoch supersession is asserted as an outcome: a pending republish whose epoch is bumped before resolution results in zero subscribe calls (`frontend/src/app/services/sfu-recovery-coordinator.spec.ts:519-556`).

### 3. Clobbering healthy remote streams — SAFE

Attack attempted: a previously healthy Alice is dropped because Bob triggered a full local rejoin; then Alice's resubscribe fails once and could stay unheard forever.

Why it holds:
- The rejoin intentionally resets all inbound state before republish (`frontend/src/app/services/sfu-client.service.ts:472-482`, `frontend/src/app/services/sfu-client.service.ts:888-916`), then `subscribeAllAdvertisedRemotes()` targets every advertised non-self publisher, not only the trigger publisher (`frontend/src/app/services/sfu-client.service.ts:489-493`).
- If a per-publisher resubscribe fails, the guard is cleared, failure evidence is stored, and `scheduleRecoveryEscalation(clientId, false)` is re-entered while the epoch is still current (`frontend/src/app/services/sfu-client.service.ts:501-515`). That path eventually emits `needs-rejoin`, arms the 30s low-frequency continuation, and triggers another coalesced full rejoin (`frontend/src/app/services/sfu-client.service.ts:317-321`; mid-call path also does this at `frontend/src/app/services/sfu-client.service.ts:1671-1675`).
- A local republish-handler failure after reset is a different failure domain: `publishInitialSfuWithRetry()` surfaces the existing audio/video-start failure notice after retry exhaustion (`frontend/src/app/pages/room/room.page.ts:1764-1828`). I did not count that as a B2b remote-subscribe silent failure.

Test honesty: the B2b spec asserts bystander recovery, not just that a rejoin ran: both Bob and Alice advertised tracks are POSTed after one coalesced rejoin (`frontend/src/app/services/sfu-recovery-coordinator.spec.ts:413-453`).

### 4. Retry storms — SAFE

Attack attempted: many publishers all hit `needs-rejoin`, Retry is clicked repeatedly, and then a synchronous re-trigger fires immediately after `finally()` clears `rejoinScheduled`.

Why it holds:
- During an in-flight/scheduled rejoin, `rejoinScheduled` blocks all additional triggers (`frontend/src/app/services/sfu-client.service.ts:415-420`).
- After the lock clears, the timestamp throttle is independent of the lock: timestamps are pruned to the 2-minute window, any attempt inside 15s of a recorded rejoin is blocked, and a third recorded rejoin inside the 2-minute window is blocked (`frontend/src/app/services/sfu-client.service.ts:452-459`).
- Throttled attempts do not push timestamps, so the user cannot create a tight rotate loop by repeatedly clicking Retry while capped (`frontend/src/app/services/sfu-client.service.ts:452-470`).
- If a normal ICE transport recovery is already scheduled/in flight, B2b rejoin exits before rotating again (`frontend/src/app/services/sfu-client.service.ts:445-450`).

Test honesty: the throttle spec walks 0s, 5s, 25s, 45s, and 225s and asserts handler call counts plus visible throttled state transitions (`frontend/src/app/services/sfu-recovery-coordinator.spec.ts:575-607`).

### 5. Silent UI failure — SAFE

Attack attempted: throttle exhausts but the banner is false; recovery succeeds but the banner stays stuck; the throttle path cancels the per-publisher 30s continuation.

Why it holds:
- Throttle exhaustion emits `unrecovered-visible` and sets `sfuRejoinThrottled` true before returning, without calling `resetForTransportRecovery()` (`frontend/src/app/services/sfu-client.service.ts:452-459`). Because the timer was armed at the `needs-rejoin` site before the trigger, throttle does not clear the 30s continuation (`frontend/src/app/services/sfu-client.service.ts:317-321`, `frontend/src/app/services/sfu-client.service.ts:357-368`).
- The banner reads the service signal directly and exposes a Retry button (`frontend/src/app/pages/room/room.page.ts:490-496`, `frontend/src/app/pages/room/room.page.html:238-242`).
- The Retry button reuses the same coalescing/throttle-gated path (`frontend/src/app/pages/room/room.page.ts:1695-1698`, `frontend/src/app/services/sfu-client.service.ts:423-426`).
- The flag clears as soon as a fresh non-throttled rejoin fires (`frontend/src/app/services/sfu-client.service.ts:468-470`) and is reset on service destroy (`frontend/src/app/services/sfu-client.service.ts:2024-2053`).

Test/evidence honesty: the service test asserts false -> true -> false -> true -> false transitions around throttle windows (`frontend/src/app/services/sfu-recovery-coordinator.spec.ts:579-607`). The Playwright test asserts no banner before forcing, visible banner after forcing, visible Retry button, and no call crash after click (`e2e/tests/sfu-b2b-rejoin-ui/sfu-rejoin-ui.spec.ts:49-62`). Screenshot proof at `plan/WK_0701/projcore-run-2026-07-01/batch-B2b/screenshots/rung4-unrecovered-banner.png` is a real 1280x720 in-call page showing the unrecovered banner and Retry button.

### Additional checks

- Production reachability of `debugForceRejoinThrottledForTest()` is acceptable: the public service method exists, but the only app-exposed debug hook is assigned inside `window.location.hostname === 'localhost'` (`frontend/src/app/pages/room/room.page.ts:684-689`). Source search found no other production caller; the new e2e calls only `window.__meetDebug.forceSfuRejoinThrottledForTest` (`e2e/tests/sfu-b2b-rejoin-ui/sfu-rejoin-ui.spec.ts:52`).
- Epoch guard holds through rotation: `runFullSfuRejoin()` captures the epoch immediately after reset and bails if superseded after handler completion (`frontend/src/app/services/sfu-client.service.ts:472-482`), while each per-publisher subscribe loop iteration also checks the captured epoch (`frontend/src/app/services/sfu-client.service.ts:495-496`).
- Mandated command passed and terminated: `cd frontend && timeout 40 npx tsx src/app/services/sfu-recovery-coordinator.spec.ts` exited 0 with `sfu-recovery-coordinator: all assertions passed`.
- `git diff --check` passed.

Overall: REPRO-CLEARED-ON-LOCAL. I could not construct a surviving duplicate subscription, stale stream/audio element, permanent bystander clobber, retry storm, or silent throttled UI failure from this diff.

STATUS: REPRO-CLEARED-ON-LOCAL
