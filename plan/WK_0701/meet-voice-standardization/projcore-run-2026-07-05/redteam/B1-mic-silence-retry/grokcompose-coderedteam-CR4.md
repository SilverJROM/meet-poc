# grokcompose CR4 verdict

Verdict: CLEAN

## Findings

### 1. Regression surface — scoped to R1, no unrelated flow contamination

**Files touched (entire B1 diff):** `mic-energy.ts`, `room.page.ts`, `mic-sweep.spec.ts` only. No password/admission, codec, reconnect, host indicator, volume balancer, preflight, lobby self-test, e2e, or backend changes.

**Intentional user-facing deltas (in-scope R1):**

| Before (one-shot latch) | After (bounded retry) |
|---|---|
| One recovery sweep per silence episode, then passive warn | Up to 8 sweeps / 90s with ~7s post-completion cooldown |
| Single terminal-style messaging from sweep side-effects | Watchdog-owned retry copy (`"Still trying to restore your microphone…"`) until `plan.exhausted`, then terminal |

**Unrelated flows verified unchanged:**

- `recoverLocalAudioTrack()` / `handleLocalTrackFailure()` — still owns ended/mute recovery; only intersects silence gate via `audioRecoveryInFlight` blocker in `planMicSweepAttempt`, not rewritten.
- `handleDeviceChangeAsync()` — still re-arms `micSweepGateState` after `refreshDevices()` (`room.page.ts:3012`).
- `pollLobbySelfTest()` — still uses `nextMicWarningState` only; does not import planner or banner helper.
- `runMicSweep()` orchestrator and `nextSweepGate()` reducer math — unchanged; planner wraps without altering bounds.

**`planMicSweepAttempt` / `micSilenceWatchdogBannerMessage` blast radius:** consumed exclusively by `verifyInitialCaptureEnergy`, `pollMicSilenceWatchdog`, and unit tests. No other importers in the frontend tree.

### 2. User-visible failure modes — acceptable residuals, not local blockers

**`none-working` watchdog ownership (intentional).** Sweep no longer sets terminal copy (`room.page.ts:3578-3583`). Prior poll retry banner persists through sweep completion; next poll refreshes copy. Brief post-sweep messaging lag (≤1 watchdog tick) is acceptable and matches CR1 synthesis intent.

**`no-candidates` / `catch` terminal-copy inconsistency (non-blocking).** `runMicRecoverySweep` still sets terminal copy on zero candidates (`room.page.ts:3527-3528`) and unexpected errors (`room.page.ts:3593-3594`). A subsequent non-exhausted watchdog poll can overwrite with retry copy — same pattern deliberately removed from `'none-working'`. Panels judged this non-blocking in `synthesis-CR3.md` because it does not affect retry-budget integrity, adopted-window hygiene, or successful-recovery false-retry. Worst case: ≤1s terminal flash before retry copy on an edge path (no enumerated mics / thrown sweep). **Acceptable; fix is polish, not a live-validation gate.**

**No silent-no-warning path on main retry loop.** During active retry, watchdog sets `micSilentWarning` + retry copy on `'silent'` classification. During sweep, `actionNotice` shows `"Checking your microphones for sound…"`. On adopted recovery, window clear + banner clear (`room.page.ts:3560-3562`) prevent false retry copy. Exhausted episode shows terminal copy via `micSilenceWatchdogBannerMessage(..., plan.exhausted)` (`room.page.ts:3834-3836`).

### 3. Runtime readiness — build proof sufficient for local gate

- `npx tsx src/app/services/mic-sweep.spec.ts` — exit 0 (re-run CR4 audit).
- `npm run build` — exit 0; `room.page.ts` imports (`planMicSweepAttempt`, `micSilenceWatchdogBannerMessage`, `INITIAL_SWEEP_GATE_STATE`, `MIC_SWEEP_RETRY_INTERVAL_MS`) resolve in the production bundle. Pre-existing warnings only (Stencil empty-glob, mediapipe CJS).
- **No browser-only defect requires local code fix before live validation.** Remaining browser/runtime variables (`getStats()` sample lag, real `getUserMedia`/`replaceAudioTrack` duration, hardware hot-plug timing, SFU publish stat availability) are environmental and correctly deferred to live proof — they cannot be honestly closed without a mic + browser session.

**Live-validation target:** `dev_machine` (`192.168.254.123`) per `decisions/2026-07-05-remote-validation-protocol.md` — reproduce-first, fix-validation client. Peer2 machine is confirmation-only after dev_machine passes. Target is appropriate for remaining risk class.

### 4. Acceptance readiness — CR1/CR2 closed; local red-team PASS warranted

| CR round | Status | Guard |
|---|---|---|
| CR1 | Closed | Blocked consumption, join/watchdog overlap, stale window, banner hygiene — `mic-sweep.spec.ts:346-414` |
| CR2 | Closed | Re-arm under blockers, exhausted reporting preserved — `mic-sweep.spec.ts:416-468` |
| CR3 | CLEAN (streak 1/2) | State-machine equivalence + blocked-launch semantics |

CR4 is the second distinct clean lens (`regression surface + live-validation readiness`). **B1 should be marked local-redteam PASS if this round is clean** (it is). Remaining risks are explicitly logged for dev_machine/Peer2, not silently accepted as done.

## Required Fixes

None before live validation.

## Residual Risk

Moved to live validation (not local code):

1. **Retry cadence under real call conditions** — confirm inter-sweep interval lands ~9–11s (7s cooldown + sweep duration), not one-shot stop, on a sustained silent-but-live mic.
2. **Banner lifecycle** — retry copy during active recovery; terminal copy after exhaustion; no false `"Still trying…"` after adopted recovery.
3. **Concurrency with hardware events** — `devicechange`/hot-plug resets budget; track-ended recovery does not double-charge or fight silence sweep.
4. **Storm bound** — no runaway `getUserMedia` under prolonged silence (cooldown + attempt cap observable in diagnostics/logs).

Optional polish (post-handback, not blocking): align `no-candidates`/`catch` terminal copy with watchdog-owned messaging for consistency with `'none-working'`.

**Proceed:** B1 may move to dev_machine validation, then Peer2 confirmation. No further local code correction required.

STATUS: CLEAN — B1 local-redteam PASS; proceed to dev_machine/Peer2 to prove live retry cadence, banner lifecycle, and hardware-event concurrency