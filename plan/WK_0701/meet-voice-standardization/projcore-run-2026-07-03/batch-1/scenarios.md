# Scenarios — Batch-1 (R1) — Persistent mic-silence self-heal

**Branch:** `feat/voice-standardization-batch-1-mic-silence-retry`
**Requirement:** R1 — watchdog keeps retrying recovery while mic remains classified silent (bounded, not infinite-storm)

---

## Unit-provable (deterministic, `npx tsx`)

Run: `cd /home/agjrom/websites/meet-poc/frontend && npx tsx src/app/services/mic-sweep.spec.ts`

| ID | Acceptance | Given | When | Then |
|----|------------|-------|------|------|
| U-15 | First silent poll fires immediately; second waits for cooldown | `INITIAL_SWEEP_GATE_STATE`, `now=1000` | `nextSweepGate(state,'silent',true,1000)` then same at `5000` then `8000` with `nextAllowedAt=8000` | first: `shouldSweep:true, attempts:1`; mid-cooldown: `shouldSweep:false`; post-cooldown: `shouldSweep:true, attempts:2` |
| U-16 | Energy return re-arms; new silence episode gets fresh sweep | armed state `attempts:3` | `'working'` at `10000` then `'silent'` at `10500` | re-arm to zeros; new sweep `shouldSweep:true, attempts:1` |
| U-17 | Indeterminate never sweeps, state unchanged | `attempts:2, episodeStartedAt:1000` | `nextSweepGate(...,'indeterminate',true,6000)` | state preserved; `shouldSweep:false` |
| U-18 | micActive=false disarms for all classifications | armed `attempts:4` | `nextSweepGate(armed, klass, false, 5000)` for each klass | `shouldSweep:false`; state re-armed to zeros |
| U-19 | Mute is pause: post-unmute silent gets fresh sweep | initial | `'silent', micActive:false` then `'silent', micActive:true` | no sweep while muted; sweep on unmute |
| R1-A | Retry-after-cooldown | `attempts:1, nextAllowedAt=1000+7000` | poll at `7999ms` vs `8000ms` elapsed | blocked before cooldown end; allowed at end |
| R1-B | Dual-bound exhaustion (attempts) | `attempts:8` | `'silent', now=2000` | `exhausted:true, shouldSweep:false` |
| R1-C | Dual-bound exhaustion (duration) | `attempts:2, episodeStartedAt:1000` | `'silent', now=91000` | `exhausted:true, shouldSweep:false` |
| R1-D | Disjointness: watchdog vs track-failure paths | armed state | `micActive:true+'silent'` vs `micActive:false` for all classes | active+silent sweeps; inactive never sweeps, always re-arms |

Existing B2c `runMicSweep` / `orderedMicCandidates` scenarios in the same spec file remain GREEN (unchanged orchestrator).

---

## Wiring (static review — room.page.ts)

| ID | Acceptance | Assert |
|----|------------|--------|
| W-1 | `audioRecoveryInFlight` guard before silence sweep | `pollMicSilenceWatchdog` and `verifyInitialCaptureEnergy` only call `runMicRecoverySweep` when `!audioRecoveryInFlight` |
| W-2 | Cooldown from completion | `runMicRecoverySweep` `finally` sets `nextAllowedAt = Date.now() + MIC_SWEEP_RETRY_INTERVAL_MS` |
| W-3 | devicechange re-arm | `handleDeviceChangeAsync` resets `micSweepGateState` after `refreshDevices()` |
| W-4 | Banner phase copy | silent + `!exhausted` → `"Still trying to restore your microphone…"`; exhausted → terminal copy |
| W-5 | No regression to track-failure handlers | `handleLocalTrackFailure` / `recoverLocalTrack` unchanged |

---

## Manual (post-fix regression on dev_machine — per testing protocol)

| ID | Scenario | Expected |
|----|----------|----------|
| M-1 | Dead mic mid-call (device removed/disabled) | Banner shows retry copy; sweeps repeat ~every 7-11s; exhausts ~75-90s with terminal copy; "Switch microphone" always visible |
| M-2 | Mic recovers mid-retry (plug back / unmute hardware) | Banner clears on `'working'`; gate re-arms for future episodes |

**Screenshots:** N/A — pure-logic batch; no UI screenshot artifact.