# Final sweep — privacy bug (camera-off propagation) + cleanup pass

JROM's two requests bundled into one focused commit batch:
1. **P0 privacy bug**: when a user toggles camera OFF, their tile correctly hides on their own device but their VIDEO STAYS VISIBLE on other devices. Privacy issue. Must be a propagation gap somewhere.
2. **Cleanup sweep**: address the tidy-up items I flagged in my honest assessment.

## Part 1 — Privacy bug investigation + fix (P0)

### Step 1: New playwright spec that REPRODUCES JROM's bug

File: `e2e/tests/fixloop-banner/camera-toggle.spec.ts` (NEW)

Test:
- Host joins with camera ON; one guest joins with camera ON, admitted
- Wait until both peer tiles on each side have `data-state="connected"` and a `<video>` element
- Host clicks Mute camera button (find it — look at `controls-bar.component.html` for the camera-toggle button selector)
- Within 5 seconds, assert on the guest's page that the host's tile has NO `<video>` element AND has the `.camera-off-avatar` element
- Bonus: host clicks the camera button AGAIN to turn on; assert guest's view of host's tile gets the `<video>` back

This MUST run first. If it FAILS, the bug is real and we know exactly where. If it PASSES, JROM's report is either a stale-bundle issue (he didn't hard-refresh) or a different scenario.

### Step 2: If Step 1 fails, diagnose

Likely places to look:
- `room.page.ts:659-676` `toggleCamera` — does `broadcastMediaState(micOn, cam)` fire reliably?
- `services/media.service.ts:223-246` `media.toggleCamera` — does it correctly return `false` after toggling off?
- The `media-state` WS handler at `room.page.ts:1089-1102` — does it correctly update `peerIdentities[clientId].camEnabled = false`?
- The `peers()` computed at `room.page.ts:189-208` — does it propagate `identity.camEnabled` to the non-local PeerState's `camEnabled` field?
- The `tile.component.ts:24` `showVideo` — does it recompute and remove the `<video>` element when `camEnabled` flips false?

A common gap: maybe `media.toggleCamera` returns the WRONG value (returns previous state instead of new state), or the broadcast happens but with the wrong `cam` value. **Add a `console.info('[camera-toggle] new state', cam)` at room.page.ts:672 and a `console.info('[media-state] received', msg.cam)` at room.page.ts:1081 for diagnostic visibility during the test run** — these can be removed before final commit if the bug turns out to be trivial.

### Step 3: Ship the fix + the spec

The spec stays in the suite (`camera-toggle.spec.ts`) so this regression is caught next time.

## Part 2 — Cleanup sweep

### Remove unused `effectiveCameraState`

File: `frontend/src/app/pages/room/room.page.ts`

Now that `broadcastMediaState` uses raw `cam`, grep for `effectiveCameraState` usage. If unused, remove the helper. If still used somewhere, leave alone and note in commit message.

### Multi-peer + screen-share e2e

File: `e2e/tests/fixloop-banner/multipeer.spec.ts` (extend existing)

Add a test (`fixloop multi-peer with screen share`):
- 3 peers, all cameras on
- One peer screen-shares
- Within 8 seconds, assert all other peers see the screen-share `share-stage` element OR `app-tile[variant=share-main]` (look at room.page.html for the correct selector)
- Assert all peer cameras still render as `<video>` in their strip tiles (the bug class that broadcast-decoupling fixed must stay fixed)
- Sharing peer stops sharing; assert layout returns to grid and all camera tiles still render video

### Quick recorder smoke (low ambition)

Just verify by code-review that the recorder doesn't depend on `effectiveCameraState` or on the camera state propagation path. If recorder mixes audio from a local stream snapshot that's still up-to-date, we're fine. Document the check in the validation note.

### activeSpeaker resource check

Code-review only: look at `active-speaker.service.ts` and confirm it disconnects analyzer nodes when peers leave (similar to `remote-audio.service.ts`'s `removeSource` pattern). If it doesn't, flag it as a future fix in the validation note (don't fix in this commit — out of scope for this sweep).

### Knock-cancel + mid-call reconnect

Code-review only. Look for `knock-cancelled` handler in `signaling/index.ts` and confirm it cleans up the knocker entry properly. Look for the multi-peer reconnect (`peer-reconnecting` / `peer-resumed`) handler in `room.page.ts:1051-1088` and confirm it doesn't leak old subscriptions. Document findings.

### TURN reachability spec (optional, skip if too complex)

Use the existing `IceConfigService.checkTurnHealth()` helper. Add a playwright spec that calls it via `window.__meetDebug` (if exposed) and asserts it returns `status: 'reachable'`. If `__meetDebug` doesn't expose this, document the gap.

## Hard constraints

- ONE commit for the privacy fix (with new spec + any code change).
- ONE commit for the cleanup sweep (dead-code removal + screen-share e2e + validation notes).
- Two commits total, not one mega-commit. Order: privacy fix first, then cleanup.
- DO NOT change `effectiveCameraOn` or `cameraVisibleDuringCurrentShare` semantics — they still drive local self-view rendering.
- DO NOT touch the audio path, the recorder, or the active-speaker service in this commit batch (out of scope).

## Acceptance gate (both commits)

1. `cd backend && npm run build` — 0 errors.
2. `cd frontend && ng build` — 0 errors.
3. `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` — ALL PASS (existing 6 + new camera-toggle + new screen-share = 8+ tests).
4. Write `validation/final-sweep.md` covering: privacy bug diagnosis, dead-code removal, screen-share spec, recorder/activeSpeaker/knock-cancel review findings, TURN reachability status.
5. Commit messages:
   - Privacy fix: `fix(room): propagate camera-off via media-state broadcast — close privacy gap`
   - Cleanup: `chore(room): remove unused effectiveCameraState helper + add screen-share+multi-peer e2e + sweep review`

## Stop conditions

- If Step 1 of Part 1 reveals the privacy bug is actually in the receiver-side rendering (not the broadcast) AND the fix requires changing `tile.component.ts` or similar, STOP and report. We may need to refactor more deeply.
- If the screen-share e2e is consistently flaky in playwright (fake-media + share dialog complications), document the limitation in the validation note and ship without that specific test step. The decoupling fix's correctness can be argued by code review.

Final line MUST be: `STATUS: DONE — final sweep ready for validation`.
