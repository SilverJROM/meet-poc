# changes.md — Pre-join Device Gate (SONNET implementer)

## Commands run
```
cd frontend
npx tsc --noEmit          → 0 errors (after PART 3, PART 1, PART 2)
npx tsx src/app/pages/room/room-decisions.spec.ts → all assertions passed
npx tsx src/app/pages/room/room-lifecycle.spec.ts  → all assertions passed
npx ng build              → Application bundle generation complete [3.859s], 0 errors, 2 pre-existing stencil/mediapipe warnings (unrelated)
```

---

## PART 3 — Device-selection persistence R8 fix

### `frontend/src/app/pages/room/room-decisions.ts`
- Added `PreflightGateStatus` type (shared by PART 1).
- Added `FallbackChosenIdInput` + `fallbackChosenIdForAudioSync()` — pure function for the R8 bug in `syncSelectedAudioIdToTrack`. The bug: when capture track reports generic id (e.g. `'default'`) on non-exact acquisition, old code returned `''` → `resolveSelectedAudioId` skipped rule 2 → selection snapped back to previous stored device. Fix: return `requestedDeviceId` instead of `''`.
- Added `PublishGateInput` + `derivePublishGateStatus()` — pure function mapping publish outcome → gate status (for unit-testing all never-publish paths).
- Added `PreflightPrereqsInput` + `missingPreflightPrereqs()` — pure function for mic+speaker gate.

### `frontend/src/app/pages/room/room-decisions.spec.ts`
Added 13 new assertions:
- **R8 regression (4 cases)**: `fallbackChosenIdForAudioSync` — generic track id preserves `requestedDeviceId`; non-generic reported id takes precedence; exact acquisition unchanged; empty reported id preserved.
- **Publish gate (5 cases)**: `derivePublishGateStatus` — PATH A (trigger never fired) → `audio-failed`; retries exhausted → `audio-failed`; no live audio at deadline (haiku path) → `audio-failed`; state-revert → `audio-failed`; happy path → `audio-connecting`.
- **Preflight prereqs (4 cases)**: `missingPreflightPrereqs` — no mic access; silent/dead mic; speaker untested; all good (camera off is NOT blocking).

### `frontend/src/app/pages/room/room.page.ts`
- `syncSelectedAudioIdToTrack` line ~2590: changed `''` to `requestedDeviceId` in the `fallbackChosenId` ternary (the one-line R8 fix).

---

## PART 1 — Robust publish + kill the silent never-publish (R3/R7)

### `frontend/src/app/services/meeting-sessions.service.ts`
- Added `publishTriggerCount?: number` and `roomState?: string` to `DiagnosticsPayload`. These persist across diagnostic log uploads so ops can retroactively distinguish PATH A (count=0, trigger never fired) from PATH B/C.

### `frontend/src/app/pages/room/room.page.ts`

**New signals / fields:**
- `readonly speakerTestCount = signal(0)` — authoritative counter for speaker test button clicks (replaces the lossy `window.__meetDebug.speakerTestCount` approach).
- `readonly preflightGateStatus = signal<PreflightGateStatus>('pending')` — tracks the full gate lifecycle from lobby through post-publish confirmation.
- `readonly preflightConfirmReady = computed(...)` — true when `lobbySelfTestFlag && speakerTestCount > 0`.
- `private publishTriggerCount = 0` — diagnostic counter; PATH A = stays 0 after admit.
- `private audioConnectingTimeoutId: number | null = null` — 30-second hard cap on `audio-connecting` state.

**`speakerTest()` (line ~1043):** Replace `window.__meetDebug.speakerTestCount` mutation with `this.speakerTestCount.update(n => n + 1)`.

**`__meetDebug` effect:** Updated `speakerTestCount` to read from signal; added `publishTriggerCount` and `preflightGateStatus`.

**`publishInitialSfuWithRetry()`:** Refactored:
- `publishTriggerCount += 1` at very top (before any guard) — counts all trigger fires.
- After early-return guard: sets `preflightGateStatus('audio-connecting')` + starts 30s hard-cap timeout.
- On success: `preflightGateStatus.set('ready')`.
- On permanent failure: `preflightGateStatus.set('audio-failed')` + opens in-call device dialog.
- `finally`: clears the timeout regardless of exit path.

**`initialPublishStream()`:** Changed `console.warn` + continue (haiku's silent empty-transceiver path) to `throw new InitialPublishPermanentError(...)`. Publishes with no live audio track now fail loudly.

**Admitted handler (line ~1802):** Unified `wasInCall`/fresh-join publish paths into single `.then()/.catch()` chain:
- `.then()` watchdog: if `preflightGateStatus` is still `'audio-connecting'` after function returns (state-revert silent exit), surfaces `audio-failed`.
- `.catch()`: surfaces any unexpected outer throw.
- New `else` branch: if `msg.participantId` or `msg.sessionId` missing → sets `audio-failed` + friendly notice (PATH A guard — never silent again).

**`retryPublishAudio()` (new):** Increments `initialPublishRunId`, clears notice, calls `publishInitialSfuWithRetry`. Wired to the "Retry audio" button in the template.

**`startAudioConnectingTimeout()` / `clearAudioConnectingTimeout()` (new):** 30-second hard cap — if still `'audio-connecting'` when timer fires, forces `'audio-failed'` + opens device dialog. Prevents infinite "Connecting your audio…" (JROM reinforcement #1).

**`cleanupCall()`:** Resets `publishTriggerCount = 0`, `preflightGateStatus.set('pending')`, `clearAudioConnectingTimeout()`.

**`buildDiagnosticsPayload()`:** Added `publishTriggerCount` and `roomState` to every diagnostic log upload.

### `frontend/src/app/pages/room/room.page.html`
- Added `audio-connecting` banner: `@if (preflightGateStatus() === 'audio-connecting')` — shows "Connecting your audio…" with `aria-live="polite"`.
- Updated "Retry audio/video" button to call `retryPublishAudio()` (sets gate state correctly on retry).

---

## PART 2 — Green-room gate + device-config panel (R1/R2/R4/R5/R6)

### `frontend/src/app/pages/room/room.page.ts`

**`missingJoinPrereqs()`:** Extended return type to `('name' | 'mic' | 'mic-silent' | 'speaker')[]`. Now calls `missingPreflightPrereqs({ hasMicAccess, micVerified: lobbySelfTestFlag(), speakerTested: speakerTestCount() > 0 })` — Join is HARD-BLOCKED until mic energy verified AND speaker tested.

**`showJoinPrereqPopout()`:** Added friendly plain-language messages for new prereq types:
- `'mic-silent'` → "We can't hear your mic — try talking now, or check it isn't muted. Use the device test below." (auto-opens device dialog)
- `'speaker'` → "Test your speaker first — press 'Test speaker' in the device panel below." (auto-opens device dialog)

**`onPreflightConfirm()` (new):** Clears the join prereq popout and closes the device dialog — called when user clicks "Confirm — everything works" in the gate panel.

### `frontend/src/app/components/device-dialog/device-dialog.component.ts`
Added inputs:
- `readonly confirmGate = input(false)` — shows confirm button in lobby mode instead of hint text.
- `readonly confirmReady = input(false)` — enables the confirm button (both mic and speaker verified).
- `readonly speakerTested = input(false)` — drives the contextual hint ("Test speaker above" vs "Talk into mic").

Added output:
- `readonly confirm = output<void>()` — emitted when user clicks "Confirm — everything works".

### `frontend/src/app/components/device-dialog/device-dialog.component.html`
Updated lobby footer to show gate confirm button when `confirmGate()`:
- If speaker not yet tested: "Test your speaker above before joining."
- If speaker tested but mic not verified: "Talk now — we need to hear your mic before joining."
- Confirm button disabled until `confirmReady()`.
- Confirm button emits `confirm` output.

### `frontend/src/app/pages/room/room.page.html`
Lobby device dialog now receives `[confirmGate]="true"`, `[confirmReady]="preflightConfirmReady()"`, `[speakerTested]="speakerTestCount() > 0"`, `(confirm)="onPreflightConfirm()"`.

---

## Coverage summary

| Requirement | How closed |
|---|---|
| R1 mic+speaker mandatory, camera optional | `missingPreflightPrereqs` + `missingJoinPrereqs` — Join hard-blocked until both pass |
| R2 validates ACTUAL FUNCTION | `lobbySelfTestFlag` (classifyMicCapture energy) gates mic; `speakerTestCount` gates speaker |
| R3 publish confirmed before fully-in-call | `preflightGateStatus='audio-connecting'` blocks "fully connected" perception; `'ready'` only on `localPublishState.status==='published'` |
| R4 device-config panel on any issue | `inCallDeviceDialogOpen.set(true)` on every `audio-failed` path; lobby dialog has confirm gate |
| R5 hard gate, friendly copy | `join()` blocked via `missingJoinPrereqs`; all messages in plain language, no WebRTC jargon |
| R6 Meet/Zoom UX | Calm banners, spinner, confirm button flow |
| R7 publish always fires / loudly fails | PATH A guard (else branch), `.then()` watchdog, `.catch()`, `initialPublishStream` throws on no-audio |
| R8 device persistence | `fallbackChosenIdForAudioSync` fix in `syncSelectedAudioIdToTrack`; `speakerTestCount` signal |

---

## CR-FIX-1 — Close CR1 red-team findings

### Commands run
```
npx tsx src/app/pages/room/room-decisions.spec.ts → all assertions passed (3 new + all existing)
npx tsc --noEmit                                  → 0 errors
npx ng build                                      → Application bundle generation complete [3.451s], 0 errors, 2 pre-existing stencil/mediapipe warnings
```

### Part A: CRITICAL state-revert guard — `publishInitialSfuWithRetry`

**`frontend/src/app/pages/room/room-decisions.ts`**
- Added `ShouldSurfacePublishFailureInput` + `shouldSurfacePublishFailure()` pure function. Returns `true` when `!publishSucceeded && gateStatus === 'audio-connecting'` — the finally-block guard's decision as a testable pure function.

**`frontend/src/app/pages/room/room.page.ts`**
- `publishInitialSfuWithRetry`: Added `let publishSucceeded = false` flag. Set `publishSucceeded = true` immediately before the success `return`. Rewrote `finally` block to be `runId === this.initialPublishRunId`-guarded — fixes the bug where an old run's `finally` could clear a concurrent new run's timeout. Inside the guard: clear timeout, then call `shouldSurfacePublishFailure()` — if true, sets `audio-failed` + notice + opens device dialog. This catches ALL exits that left the gate at `'audio-connecting'` without setting `'ready'`, including the state-revert-mid-retry path (LINE A at line 1621/1624) that the broken `.then()` watchdog missed.
- Removed the broken `.then()` watchdog from the admitted handler (it checked `state() === 'in-call'` — FALSE on state-revert → never fired). Replaced with just `.catch()` for outer unexpected throws.
- `startAudioConnectingTimeout()`: 30 000 → 15 000 ms (per opus nit).

**`frontend/src/app/pages/room/room-decisions.spec.ts`**
- Added 3 new assertions for `shouldSurfacePublishFailure`:
  1. `publishSucceeded=false, gateStatus='audio-connecting'` → `true` (state-revert → must surface)
  2. `publishSucceeded=true, gateStatus='ready'` → `false` (happy path → no surface)
  3. `publishSucceeded=false, gateStatus='audio-failed'` → `false` (inner loop already set → no double-set)

### Part B: R3 real-transmission gate

**`frontend/src/app/services/sfu-client.service.ts`**
- Added `hasOutboundAudioTrack(): Promise<boolean>` — calls `pc.getStats()` and returns `true` iff an `outbound-rtp` stat with `kind === 'audio'` exists. Checks stat EXISTENCE not `bytesSent > 0`: a muted joiner is correctly published with ~0 audio energy bytes but a valid outbound-rtp entry. This correctly passes muted joiners while catching the case where the transceiver/sender was never established.

**`frontend/src/app/pages/room/room.page.ts`**
- After `publishSfuOnceAfterAdmit` succeeds (inside the retry loop, before setting `'ready'`): added `await delay(2_000)` + state/runId guard + `sfuClient.hasOutboundAudioTrack()` check. If the outbound-rtp audio stat is absent → `audio-failed` + notice + device dialog, with `publishSucceeded` still `false` so the `finally` guard's `gateStatus !== 'audio-connecting'` check prevents a double-set.

### Part C: R3 UX — mic control connecting state

**`frontend/src/app/components/controls-bar/controls-bar.component.ts`**
- Added `readonly audioConnecting = input(false)`.

**`frontend/src/app/components/controls-bar/controls-bar.component.html`**
- Mic button split-control: added `[class.is-connecting]="audioConnecting()"` on both the wrapper and the button.
- Mic icon: replaced with `@if (audioConnecting())` guard — shows `reload-outline` spinner when connecting, normal mic icon otherwise.
- Aria-label and title reflect connecting state when `audioConnecting()`.

**`frontend/src/app/pages/room/room.page.html`**
- Added `[audioConnecting]="preflightGateStatus() === 'audio-connecting'"` to `app-controls-bar`.

### Exit-point coverage after CR-FIX-1

| Exit path | `publishSucceeded` | `preflightGateStatus` at finally | `finally` guard fires? | Outcome |
|---|---|---|---|---|
| State-revert mid-retry (LINE A) | false | `audio-connecting` | YES | `audio-failed` + dialog |
| State-revert post-success pre-`'ready'` | false | `audio-connecting` | YES | `audio-failed` + dialog |
| Retries exhausted (inner explicit set) | false | `audio-failed` | NO (double-set prevented) | `audio-failed` (already set) |
| Transceiver not established (bytesSent gate) | false | `audio-failed` | NO (double-set prevented) | `audio-failed` (already set) |
| Happy path | true | `ready` | NO | `ready` |
| Outer unexpected throw | false | `audio-connecting` | YES (if runId matches) | `audio-failed` + dialog |

---

## CR-FIX-2 — Fix 2 CRITICAL gate bugs (mic-gate inversion + speaker click-not-heard)

### Commands run
```
cd frontend
npx tsc --noEmit                                  → 0 errors
npx tsx src/app/pages/room/room-decisions.spec.ts → all assertions passed (8 new + all existing)
npx tsx src/app/pages/room/room-lifecycle.spec.ts → all assertions passed
npx ng build                                      → Application bundle generation complete [3.693s], 0 errors, 2 pre-existing stencil/mediapipe warnings (unrelated)
```

### CRITICAL 1 — Mic gate INVERSION: `micWorking` positive signal

**Root cause:** `lobbySelfTestFlag` is a WARNING signal (true=silent, false=working/untested).
Wiring it directly as `micVerified` inverted the gate: working mics were blocked, silent mics joined.

**Fix:**

#### `frontend/src/app/pages/room/room-decisions.ts`
- Imported `MicCaptureClass` from `mic-energy`.
- Added `nextMicWorkingState(current, cls, micActive)` pure function — the POSITIVE reducer:
  - `micActive=false` → `false`
  - `'working'` → `true`
  - `'silent'` → `false`
  - `'indeterminate'` → `current` (no flicker)
- Updated `PreflightPrereqsInput.micVerified` comment to reflect new signal.

#### `frontend/src/app/pages/room/room.page.ts`
- Imported `nextMicWorkingState` from `room-decisions`.
- Added `readonly micWorking = signal(false)` — POSITIVE gate signal (starts false/untested).
- Removed `speakerTestCount` signal; replaced with `speakerVerified = signal(false)` and `speakerTestPending = signal(false)`.
- `preflightConfirmReady`: changed to `computed(() => this.micWorking() && this.speakerVerified())`.
- `missingJoinPrereqs`: changed `micVerified: this.lobbySelfTestFlag()` → `micVerified: this.micWorking()`.
- `pollLobbySelfTest`: added `this.micWorking.set(nextMicWorkingState(this.micWorking(), cls, micActive))` alongside the existing warning flag update. `lobbySelfTestFlag` kept as-is (still drives the "No sound detected" warning copy).
- `stopLobbySelfTest`: added `this.micWorking.set(false)` (reset on stop/leave).
- `changeAudioDevice`: added `this.micWorking.set(false)` alongside `lobbySelfTestFlag.set(false)` (prior device verdict can't bleed onto new device).
- `cleanupCall`: added `this.speakerVerified.set(false)` and `this.speakerTestPending.set(false)`.
- `__meetDebug` type: `speakerTestCount?: number` → `speakerVerified?: boolean`.

---

### CRITICAL 2 — Speaker gate: explicit "Did you hear it?" confirm

**Root cause:** `speakerTestCount` incremented immediately after `oscillator.start()` — no proof of hearing. iOS autoplay-blocked tones are silent; the gate passed on click alone.

**Fix:**

#### `frontend/src/app/pages/room/room.page.ts`
- `testSpeaker()` rewritten:
  - Wraps `createOscillator + context.resume() + oscillator.start()` in try/catch.
  - On success: plays tone + sets `speakerTestPending.set(true)` — shows Yes/No confirm.
  - On error (autoplay block, oscillator failure): sets `deviceDialogError` with guidance; does NOT set pending or verified.
  - Never increments any counter or sets verified on click.
- Added `confirmSpeakerHeard()`: sets `speakerTestPending(false)`, `speakerVerified(true)`, clears error.
- Added `speakerNotHeard()`: sets `speakerTestPending(false)`, `speakerVerified(false)`, sets guidance copy.
- `changeAudioOutputDevice`: added `speakerVerified.set(false)` + `speakerTestPending.set(false)` — switching speaker invalidates prior test.
- `missingJoinPrereqs`: `speakerTested: this.speakerTestCount() > 0` → `speakerTested: this.speakerVerified()`.

#### `frontend/src/app/components/device-dialog/device-dialog.component.ts`
- Added inputs: `readonly micVerified = input(false)`, `readonly speakerTestPending = input(false)`.
- Added outputs: `readonly speakerConfirmed = output<void>()`, `readonly speakerDenied = output<void>()`.

#### `frontend/src/app/components/device-dialog/device-dialog.component.html`
- Mic panel: added `@else if (!micVerified() && mode() === 'lobby')` block showing "Say something to test your mic — speak now and watch the level above" (actionable prompt when untested, distinct from the silent-flag warning).
- Speaker button: disabled + label changes to "Playing tone…" while `speakerTestPending()`.
- Added `@if (speakerTestPending())` Yes/No confirm block after the button ("Did you hear it? [Yes] [No]").
- Gate hint footer: "Test your speaker above before joining." → "Test your speaker above and confirm you heard it." / "Talk now — …" → "Say something into your mic — speak now so the meter reacts, then join."

#### `frontend/src/app/pages/room/room.page.html`
- Changed `[speakerTested]="speakerTestCount() > 0"` → `[speakerTested]="speakerVerified()"`.
- Added `[micVerified]="micWorking()"`.
- Added `[speakerTestPending]="speakerTestPending()"`.
- Added `(speakerConfirmed)="confirmSpeakerHeard()"` and `(speakerDenied)="speakerNotHeard()"`.

#### `frontend/src/app/pages/room/room.page.ts` — `showJoinPrereqPopout`
- mic-silent popout message: changed to "Say something into your mic — we need to hear you before you can join. Check it isn't muted and speak now." (explicit action, not just hint).

---

### Tests added (`room-decisions.spec.ts`)

8 new assertions:

**`nextMicWorkingState` (6 cases):**
1. `'working'` + micActive → `true`
2. `'silent'` + micActive → `false`
3. `'indeterminate'` after working → stays `true` (no flicker)
4. `'indeterminate'` while untested → stays `false` (no false pass)
5. micActive=false + working cls → `false` (mic off = unverified)
6. micActive=false + working cls (init=false) → `false`

**Speaker confirm gate (2 cases, via `missingPreflightPrereqs`):**
7. `speakerTested=false` (tone played, not confirmed) → gate blocks with `['speaker']`
8. `speakerTested=true` (confirmed heard) → gate clears `[]`

---

### Coverage matrix update

| Bug | Fix | Gate behavior after fix |
|---|---|---|
| Working mic → blocked (micVerified inverted) | `micWorking` positive signal; gate reads `micWorking()` not `lobbySelfTestFlag()` | Working mic → `micWorking=true` → join unblocked |
| Silent mic → passes gate | Same fix | Silent mic → `micWorking=false` → blocked with `'mic-silent'` |
| Speaker click-not-heard passes gate | `speakerVerified` only on explicit Yes | Unconfirmed click → `speakerVerified=false` → blocked |
| iOS autoplay-blocked tone silently passes | try/catch; error shown, pending not set | Autoplay error → guidance shown, gate stays blocked |
| Speaker test not reset on device switch | `changeAudioOutputDevice` resets `speakerVerified` | Switching speaker → must re-test |

## CR-FIX-3 — R9 (host audio-health badge + truly-quiet guests) + R10 (failure-simulation matrix)

### Commands run
```
cd frontend
npx tsx src/app/pages/room/room-decisions.spec.ts → all assertions passed (20 new + all existing)
npx tsc --noEmit                                  → 0 errors
npx ng build                                      → Application bundle generation complete [3.597s], 0 errors, 2 pre-existing stencil/mediapipe warnings
npx vitest run ../backend/tests/session-diagnostics.test.ts → 15 passed
```

---

### R9-Part1: Host audio-health badge (host-only, per-tile)

**New pure fn in `frontend/src/app/pages/room/room-decisions.ts`:**
- Added `PeerAudioHealthInput` type + `classifyPeerAudioHealth()`:
  - `!isPublishing` → `'ok'` (not expected to send audio yet)
  - `!hasTrack || bytesReceivedNow === null` → `'no-track'` (badge: no audio)
  - `bytesReceivedPrev !== null && bytesReceivedNow <= bytesReceivedPrev` → `'stalled'` (badge: audio frozen)
  - else → `'ok'`

**`frontend/src/app/pages/room/room.page.ts`:**
- Added `readonly remoteAudioUnhealthyIds = signal<ReadonlySet<string>>(new Set())` — set of remote clientIds the host can't hear.
- Added `private readonly prevInboundBytes = new Map<string, number | null>()` — previous-tick bytesReceived snapshot per peer.
- Added `peerAudioUnhealthy(peer): boolean` — checks `remoteAudioUnhealthyIds`.
- Added `private updateRemoteAudioHealth(inboundAudio)` — called inside `pollRemoteVoiceWatchdog` (host-only guard) after each watchdog tick. Compares current vs prev `bytesReceived` for every publisher, updates unhealthy set, rotates prev snapshot.
- Imported `classifyPeerAudioHealth` and `PeerAudioHealthInput` from `room-decisions`.
- `cleanupCall`: added `remoteAudioUnhealthyIds.set(new Set())` + `prevInboundBytes.clear()`.

**`frontend/src/app/components/tile/tile.component.ts`:**
- Added `readonly audioUnhealthy = input(false)`.

**`frontend/src/app/components/tile/tile.component.html`:**
- Added badge in `top-row`: `@if (audioUnhealthy() && !peer().isLocal) { <span class="audio-health-badge" ...>No audio</span> }`.

**`frontend/src/app/pages/room/room.page.html`:**
- Passed `[audioUnhealthy]="isHost() && peerAudioUnhealthy(peer)"` to all three `<app-tile>` usages (grid, strip, share-main). Host-gating is in the expression — badge is invisible for non-hosts even if the signal had data.

---

### R9-Part2: Truly quiet guests (CORRECTED from APPROVED-PLAN)

Both `initialPublishFailureNotice` (the "retry/rejoin" technical text) AND `inCallDeviceDialogOpen` are now host-only.

**New pure fns in `room-decisions.ts`:**
- `shouldOpenDeviceDialogOnAudioFail({ isHost }) → isHost`
- `shouldShowAudioFailNotice({ isHost }) → isHost`

**`room.page.ts` — gated call sites (7 notice + 5 dialog):**

| Location | Notice gated? | Dialog gated? |
|---|---|---|
| `startAudioConnectingTimeout` (15s hard-cap) | YES | YES |
| `retryPublishAudio` (no sessionId) | YES | — |
| `publishInitialSfuWithRetry` — `!trackEstablished` | YES | YES |
| `publishInitialSfuWithRetry` — `!retry.shouldRetry` | YES | YES |
| `publishInitialSfuWithRetry` — `finally` guard | YES | YES |
| Admitted `.catch()` (outer unexpected throw) | YES | YES |
| Admitted `else` branch (PATH A — no sessionId) | YES | — |

For non-hosts: `preflightGateStatus.set('audio-failed')` still runs (state is correct + diagnostics capture it); `initialPublishFailureNotice` stays `null`; `inCallDeviceDialogOpen` stays closed. Guest sees only the `audio-connecting` spinner / "Connecting your audio…" banner until the gate resolves. Internal retries still run up to the retry cap.

**Green-room (lobby) untouched**: `lobbyDeviceDialogOpen` is user-controlled, not auto-opened by failures — always visible for guest device setup.

---

### R10: Failure-simulation test matrix

All tests in `room-decisions.spec.ts` (pure-fn / telemetry-replay pattern). 20 new assertions.

| Row | Pure fn tested | Result |
|---|---|---|
| (a) bytes frozen at 0 (×2) | `classifyPeerAudioHealth` | `'stalled'` → host badge |
| (a) bytes climbing | `classifyPeerAudioHealth` | `'ok'` |
| (a) no inbound track | `classifyPeerAudioHealth` | `'no-track'` → host badge |
| (a) not publishing | `classifyPeerAudioHealth` | `'ok'` (no false badge) |
| (a) first sample (no prev) | `classifyPeerAudioHealth` | `'ok'` (no false-positive on first tick) |
| (a) bytes decreased | `classifyPeerAudioHealth` | `'stalled'` |
| (b) publish-fails | `derivePublishGateStatus` | `'audio-failed'` |
| (c) hasPc=false / trigger never fires | `derivePublishGateStatus` | `'audio-failed'` |
| (d) state-revert (×2) | `shouldSurfacePublishFailure` + `derivePublishGateStatus` | guard fires + `'audio-failed'` |
| (e) mic-dies-mid-call (track ended) | `decideLocalTrackFailureRecovery` | `'recover-ended'` |
| (f) speaker-dead | `missingPreflightPrereqs` | `['speaker']` blocks gate |
| (g) device-unplugged | `missingPreflightPrereqs` | `['mic']` blocks gate |
| (h) permission-revoked | `missingPreflightPrereqs` | `['mic', 'speaker']` blocks gate |
| (i) empty-transceiver (×3) | `requireLiveTransceiver` | throws loudly (null + undefined) / passes through live |
| R9 quiet-guest (×4) | `shouldOpenDeviceDialogOnAudioFail` + `shouldShowAudioFailNotice` | host=true, guest=false |

---

### Coverage after CR-FIX-3

| Requirement | How closed |
|---|---|
| R9 host audio-health badge | `classifyPeerAudioHealth` + `updateRemoteAudioHealth` in watchdog (host-only) + tile `audioUnhealthy` badge |
| R9 quiet guests (no technical text in-call) | `shouldShowAudioFailNotice` gates all 7 notice call sites; `shouldOpenDeviceDialogOnAudioFail` gates all 5 dialog call sites |
| R9 green-room setup kept for guests | Lobby device dialog untouched — user-toggled, separate from in-call failure paths |
| R9 everything logged to diagnostics | `preflightGateStatus='audio-failed'` + inbound stats already in `collectDiagnostics()` snapshot |
| R10 failure-simulation matrix | 20 pure-fn assertions cover all 9 failure modes + quiet-guest policy |

## CR-FIX-4 — Harden R9 host audio-health badge (roster coverage + grace + mute-awareness)

### Commands run
```
cd frontend
npx tsc --noEmit                                  → 0 errors
npx tsx src/app/pages/room/room-decisions.spec.ts → all assertions passed (5 new CR-FIX-4 + all existing)
npx ng build                                      → Application bundle generation complete, 0 errors, 2 pre-existing stencil/mediapipe warnings
```

---

### `frontend/src/app/pages/room/room-decisions.ts`

**`PeerAudioHealthInput`** — added two required fields:
- `micEnabled: boolean` — peer's mic is on; muted peers must not be badged
- `pastGrace: boolean` — grace window has elapsed since peer was admitted (suppresses flicker on join)

**`PeerAudioHealthResult`** — added `'never-published'` variant for the Joanne case (admitted + past grace + never published; distinct from `'no-track'` for test clarity).

**`classifyPeerAudioHealth`** — new priority order:
1. `!micEnabled` → `'ok'` (muted — no badge; mute beats all other checks)
2. `!pastGrace` → `'ok'` (subscription setup window — no flicker on every join)
3. `!isPublishing` → `'never-published'` (admitted + past grace + never published; Joanne case)
4. `!hasTrack || bytesNow === null` → `'no-track'`
5. bytes stalled → `'stalled'`
6. else → `'ok'`

---

### `frontend/src/app/pages/room/room.page.ts`

**New constant** (with other MS constants ~line 96):
```
PEER_AUDIO_GRACE_MS = 7_000
```

**New field** (alongside `prevInboundBytes`):
```
private readonly peerFirstSeen = new Map<string, number>()
```

**`updateRemoteAudioHealth` rewrite** — now iterates `this.peers()` (not `sfuClient.remotePublishers()`):
- For each non-local admitted peer: tracks first-seen timestamp in `peerFirstSeen`
- Looks up `isPublishing = publishers.has(clientId)` from `remotePublishers` as a lookup (not iteration source)
- Computes `pastGrace = (now - firstSeen) >= PEER_AUDIO_GRACE_MS`
- Passes `micEnabled: peer.micEnabled` and `pastGrace` into `classifyPeerAudioHealth`
- Prunes `peerFirstSeen` entries for departed peers after each poll

**`cleanupCall`** — added `this.peerFirstSeen.clear()` alongside `prevInboundBytes.clear()`

---

### `frontend/src/app/pages/room/room-decisions.spec.ts`

**Updated existing R10(a) tests** — added `micEnabled: true, pastGrace: true` to all 5 publishing-peer calls; updated the non-publishing "not yet joined SFU" test to use `pastGrace: false, micEnabled: true` (within-grace case, still `'ok'`).

**5 new CR-FIX-4 assertions:**

| Scenario | Key inputs | Expected |
|---|---|---|
| Muted + stalled bytes | `micEnabled: false, isPublishing: true, pastGrace: true` | `'ok'` (no cry-wolf) |
| Just joined (within grace) | `micEnabled: true, isPublishing: false, pastGrace: false` | `'ok'` (no flicker) |
| Admitted + past grace + never published + unmuted | `micEnabled: true, isPublishing: false, pastGrace: true` | `'never-published'` (Joanne case → badge) |
| Admitted + past grace + never published + muted | `micEnabled: false, isPublishing: false, pastGrace: true` | `'ok'` (mute beats never-published) |
| Publishing + stalled + unmuted + past grace | `micEnabled: true, isPublishing: true, bytesNow=0, bytesPrev=0, pastGrace: true` | `'stalled'` (badge) |

---

### Coverage after CR-FIX-4

| Finding | Fix |
|---|---|
| Joanne case (admitted never-published) invisible to host | Roster iteration via `peers()` — every admitted non-local peer evaluated, not just `remotePublishers` |
| Flicker on every join (subscription setup ~1.5-3s) | `peerFirstSeen` map + 7s grace — no badge until peer has had time to publish |
| Muted guest false-positive (cry-wolf) | `!micEnabled → 'ok'` takes priority over all other checks |
| `peerFirstSeen` leak across calls | `peerFirstSeen.clear()` in `cleanupCall()` |

## Not committed
Per instructions: no git commit. Verifier validates first.
