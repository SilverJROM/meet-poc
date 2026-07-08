# Changes — Batch-1 (R1) — Persistent mic-silence self-heal

**Branch:** `feat/voice-standardization-batch-1-mic-silence-retry` (changes on `main` working tree — branch cut pending)
**Requirement:** R1

---

## User Report (verbatim, og-requirements.md)

> The local mic-silence watchdog (`mic-energy.ts` / `room.page.ts`) currently does ONE device sweep, then falls back to a passive, dismissible banner. Participant `acctg` rode silent for ~61 minutes in this morning's call because the sweep never retried. Acceptance: Watchdog keeps retrying recovery (bounded, not infinite-storm) while the mic remains classified silent, instead of stopping after one sweep.

## Root Cause (mechanism — what + where)

`nextSweepGate` (`mic-energy.ts:323-335`) was a pure **one-shot boolean latch** (`swept`): the first `'silent'` poll per episode consumed exactly one `runMicRecoverySweep()`, and every subsequent silent poll returned `shouldSweep:false` with no retry interval, attempt counter, or wall-clock bound. `pollMicSilenceWatchdog` (`room.page.ts:3811`) drove this gate on every watchdog tick — so after one failed sweep the mic stayed silent indefinitely while the banner showed only terminal/passive state.

---

## Code Changes (per-file WHAT + WHY)

### `frontend/src/app/services/mic-energy.ts`

- **REPLACED `nextSweepGate(swept, classification, micActive)`** with a pure, `now`-injected, bounded cooldown+counter reducer over `SweepGateState = { attempts, episodeStartedAt, nextAllowedAt }`. Returns `{ ...state, shouldSweep, exhausted }` where `exhausted` is derived (never stored) from dual first-to-fire bounds. WHY: R1 requires persistent retry while silent, not one-shot-then-give-up.
- **ADDED constants** `MIC_SWEEP_RETRY_INTERVAL_MS=7000`, `MIC_SWEEP_MAX_ATTEMPTS=8`, `MIC_SWEEP_MAX_DURATION_MS=90000`, plus `INITIAL_SWEEP_GATE_STATE`. WHY: settled deliberation cadence (~9-11s inter-sweep with duration stacked; ~75-90s exhaust).
- **Re-arm rules:** `!micActive` or `'working'` → full reset; `'indeterminate'` unchanged; `'silent'` → first attempt immediate, cooldown via `nextAllowedAt`, dual-bound exhaustion. WHY: mute/devicechange/energy-return must not permanently consume retry budget.

### `frontend/src/app/pages/room/room.page.ts`

- **Replaced `micSweepDoneForEpisode: boolean`** with `micSweepGateState: SweepGateState`; reset in `cleanupCall`. WHY: boolean latch cannot express cooldown/attempts/duration bounds.
- **`pollMicSilenceWatchdog()`** — drives new gate with `Date.now()`; on `'silent'`: sets retry banner `"Still trying to restore your microphone…"` while `!exhausted`, terminal copy when exhausted; sweep only when `gate.shouldSweep && !audioRecoveryInFlight`. WHY: active-retry UX + no race with ended-track recovery.
- **`runMicRecoverySweep()` `finally`** — sets `nextAllowedAt = Date.now() + MIC_SWEEP_RETRY_INTERVAL_MS`. WHY: cooldown counted from sweep **completion** (consensus).
- **`verifyInitialCaptureEnergy()`** — uses gate reducer for first-attempt accounting instead of `micSweepDoneForEpisode = true`; same `audioRecoveryInFlight` guard. WHY: join-time gate shares retry budget model.
- **`handleDeviceChangeAsync()`** — re-arms `micSweepGateState` after `refreshDevices()`. WHY: newly plugged mic must reset episode budget (was missing).

### `frontend/src/app/pages/room/room.page.html`

- **No change.** `micSilentWarningMessage()` signal already renders message branch (~201-204); "Switch microphone" unchanged.

### `frontend/src/app/services/mic-sweep.spec.ts`

- **Rewrote AC-C6 (U-15..U-19)** for new reducer signature.
- **Added R1-A..R1-D:** retry-after-cooldown, dual-bound exhaustion (attempts + duration), disjointness (micActive true vs false). WHY: prove outcomes per brief, not call-count theater.

---

## Autonomous decisions

None.

---

## Screenshots

N/A — pure-logic batch; no UI screenshot applies.

---

## Verification

```bash
cd /home/agjrom/websites/meet-poc/frontend && npx tsx src/app/services/mic-sweep.spec.ts
# mic-sweep: all assertions passed

cd /home/agjrom/websites/meet-poc/frontend && npm run build
# Application bundle generation complete.
```