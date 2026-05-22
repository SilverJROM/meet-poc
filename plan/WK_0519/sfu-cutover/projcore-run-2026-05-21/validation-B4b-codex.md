# B4b Independent Validation - Codex

Batch: B4b - SR-4 late join + live publisher pickup + unsubscribe on leave
Commit validated: `afb04412be1ded3c8c89d55ca662d530ab0a3a8d`
Branch: `feat/sfu-cutover`
Validator role: independent validator only; no source edits made.

## Scope Checked

- `git show afb0441` shows exactly two committed file changes:
  - `frontend/src/app/services/sfu-client.service.ts`
  - `e2e/tests/sfu-b4b-late-join/sfu-late-join.spec.ts`
- `frontend/src/app/services/webrtc.service.ts` is unchanged in B4b.
- B4b artifacts exist:
  - `plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/B4b/changes.md`
  - `plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/callbacks.md`

## Diff Review

PASS. `SfuClientService.removePeer(clientId)` now calls `tearDownPeerSubscription(clientId)` before mutating the `remotePublishers` roster. This ordering is correct for SR-4 because it clears the SFU subscription state and ghost remote stream before the roster recomputes.

PASS. `tearDownPeerSubscription(clientId)` performs the expected cleanup:

- Collects all subscribed mids whose `entry.publisherClientId === clientId`.
- Deletes those mids from the `subscribedTracks` signal copy.
- Deletes the same mids from `midToEntry`.
- Deletes the leaving publisher from `remoteStreams`.
- Deletes the publisher clientId from `subscribedClientIds`.
- Enqueues close only when there are mids and live caller/session credentials.

PASS. `doClose(...)` sends `PUT /api/sfu/tracks/close` with `{ ...creds, cfSessionId, tracks: mids.map((mid) => ({ mid })) }`, and it is only invoked through `enqueue(...)`. That satisfies the "all close ops via enqueue" requirement.

No unrelated B4b source changes found. `webrtc.service.ts` has no diff from B4a to B4b.

## Late Join / Live Pickup Mechanism

PASS. B4b does not change the B4a subscription effect in `room.page.ts`; no regression found. The existing effect:

- Runs only in SFU mode.
- Waits until `sfuClient.localPublishState()?.status === 'published'`.
- Reads the full `remotePublishers()` map.
- Iterates all publishers, skips only self, and calls `subscribeIfNeeded(publisher)`.

That mechanism is N-independent: whether the roster contains one existing publisher or many, the same loop attempts each missing subscription, while `subscribeIfNeeded` prevents duplicate subscription by `subscribedClientIds`.

Independent opinion: the 2-client proof is sufficient for SR-4 acceptance when combined with the line-level mechanism review. It proves both directions of the SR-4 behavior:

- Late join: B joins after A is already established and receives A's media.
- Live pickup: A receives B after B publishes.
- Leave teardown: A drops B from `remoteStreams` after B explicitly leaves.

A 3-client e2e would be stronger as a performance/regression test, but it is not required to prove the correctness of the current N-independent subscription loop.

## 3-Client Fallback Assessment

The implementer fallback to a 2-client proof is acceptable for SR-4 correctness.

The reported 30-60s A `ontrack` delay for a late third publisher should not be dismissed as purely a headless artifact. Headless Playwright, fake media, shared browser contexts, and CI resource pressure can amplify timing, but this path depends on real Cloudflare SFU renegotiation and ICE behavior. A repeatable 30-60s delay in the 3-client harness is a likely real UX risk for rooms above two participants, even if the exact duration may be test-environment inflated.

Recommendation: track the 3-client late-subscribe latency separately as a follow-up performance/reliability issue. It should not block B4b/SR-4 correctness acceptance because the requested SR-4 behaviors are implemented and independently proven at the two-client level.

## Test Run

Command run exactly as requested:

```bash
E2E_BACKEND_PORT=4822 E2E_FRONTEND_PORT=4823 E2E_PROXY_PORT=4821 E2E_BASE_URL=http://localhost:4821 E2E_WS_ORIGIN=ws://localhost:4821 MEET_DB_PATH=/tmp/meet-sfu-b4b-val.sqlite npm test -w e2e -- tests/sfu-b4b-late-join --config=playwright.config.ts --workers=1
```

Result:

```text
Running 1 test using 1 worker

  ✓  1 [chromium] › tests/sfu-b4b-late-join/sfu-late-join.spec.ts:59:1 › B4b: late join subscribes to all present + leave tears down subscription (2-client SFU) (6.9s)

  1 passed (14.9s)
```

This test proves:

- A is joined and published before B enters.
- B joins late and receives inbound audio/video from A.
- A receives inbound audio/video from B after B publishes.
- Before leave, A has exactly one SFU remote stream.
- After B clicks "Leave call", A's `remoteStreams.size` becomes `0`.

## Verdict

B4b satisfies SR-4 completion for late join, live publisher pickup, and unsubscribe-on-leave teardown. The 3-client latency observation remains a follow-up UX/performance risk, not a correctness failure for this batch.

STATUS: VALIDATED-PASS
