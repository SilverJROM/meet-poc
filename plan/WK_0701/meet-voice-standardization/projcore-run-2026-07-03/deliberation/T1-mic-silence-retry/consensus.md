# Consensus — T1: Persistent mic-silence self-heal (R1)

STATUS: AGREED (settled by projcore/Opus coordinator after round 2 — both co-planners had
converged to trivially-different numeric constants and both explicitly deferred the final pick
to whichever the other/coordinator preferred; a round 3 would have added no substance).

## Agreed mechanism

Replace the one-shot boolean latch in `nextSweepGate` (`frontend/src/app/services/mic-energy.ts:323-335`)
with a **pure, `now`-injected, bounded cooldown+counter reducer** — `Date.now()` never called
inside the pure function, preserving the file's existing "PURE sweep-GATE reducer" contract.

```ts
export type SweepGateState = { attempts: number; episodeStartedAt: number; nextAllowedAt: number };
export function nextSweepGate(
  state: SweepGateState, classification: MicCaptureClass, micActive: boolean, now: number,
  opts?: { maxAttempts?: number; maxDurationMs?: number },
): SweepGateState & { shouldSweep: boolean; exhausted: boolean }
```

- `!micActive` (mute/disabled) or `'working'` → re-arm: `{attempts:0, episodeStartedAt:0, nextAllowedAt:0}`.
- `'indeterminate'` → unchanged, no flicker (matches today).
- `'silent'`:
  - `attempts === 0` → immediate first sweep, `episodeStartedAt = now`.
  - `attempts >= maxAttempts` OR `now - episodeStartedAt >= maxDurationMs` → `exhausted:true`,
    `shouldSweep:false` (drop to passive-warn). **Dual bound, first-to-fire** — both are needed:
    attempts guards the fast-sweep storm (mobile battery/thrash), wall-clock guards the
    slow-sweep tail (a sweep can stall arbitrarily long — `replaceAudioTrack`'s acquisition queue
    has no local `getUserMedia` timeout today, so attempts-only cannot bound wall-clock; this was
    Opus's round-1 error, corrected in round 2 after Codex traced the acquisition path).
  - `now < nextAllowedAt` → in cooldown, `shouldSweep:false`.
  - else → consume: `attempts+1`, `shouldSweep:true`. Caller sets `nextAllowedAt = now + cooldown`
    in the sweep's completion handler (cooldown measured from completion, not start, so a long
    multi-device sweep can't immediately re-trigger).
  - `exhausted` is DERIVED in the return value, never stored (avoids desync).

## Settled constants

- `MIC_SWEEP_RETRY_INTERVAL_MS = 7_000` (cooldown; real inter-sweep cadence lands ~9-11s once
  sweep duration stacks on top — within JROM's "5-10s active recovery" ask).
- `MIC_SWEEP_MAX_ATTEMPTS = 8`.
- `MIC_SWEEP_MAX_DURATION_MS = 90_000` — calibrated so both bounds fire around the same nominal
  point (~75-90s), no surprising asymmetry between the two guards.
- Re-arm (full budget reset) on: energy-return (`'working'`), mute/unmute (`micActive:false`),
  and `devicechange` (in `handleDeviceChangeAsync`, `room.page.ts:3005-3017`, after
  `refreshDevices()`).

## Full resweep every cycle (unanimous, no disagreement)

Each retry re-runs the existing `runMicSweep()` unchanged — re-enumerates, current-device-first
candidate walk, restores original if none work. Re-enumeration is what catches a newly-plugged
mic between cycles; narrowing to "retry last candidate only" buys nothing since we'd need to
re-enumerate anyway. Storm risk is fully owned by the cooldown+dual-bound above, not by
narrowing the sweep.

## Banner copy (unanimous)

- Active retry (not yet exhausted): `"Still trying to restore your microphone…"`.
- Exhausted: existing copy, `"No working microphone detected — check your mic/permissions"`.
- `"Switch microphone"` button stays visible throughout (`room.page.html:201-204` structurally
  unchanged).

## Double-recovery guard (unanimous)

- Condition disjointness: silence watchdog only acts on `micActive = live && enabled && unmuted`
  — a track that never fires `ended`/`mute`. Track-failure handlers
  (`handleLocalTrackFailure`, `room.page.ts:3368`) only fire on `ended`/`mute` — at which point
  `micActive` is false and the silence gate re-arms and does nothing. Mutually exclusive states.
- `micSweepInProgress` (existing) blocks re-entrant sweeps; NEW guard —
  `!this.audioRecoveryInFlight` checked before starting a silence-triggered sweep, so it never
  starts while an ended-track recovery is mid-flight.
- Swap safety: during a sweep's `replaceAudioTrack`, the old track's `ended` event routes through
  `handleLocalTrackFailure` → `isCurrentLocalTrack(old)` is false → early-return. No duplicate
  recovery (verified against current code by both planners independently).

## Touched files (implementer target list)

- `frontend/src/app/services/mic-energy.ts` — `nextSweepGate` rewrite (~line 323), new constants.
- `frontend/src/app/pages/room/room.page.ts` — state fields replacing `micSweepDoneForEpisode`
  (~line 580), watchdog call site (~3811-3812), `cleanupCall` reset (~2826-2827),
  `verifyInitialCaptureEnergy` initial-attempt accounting (~3499), `handleDeviceChangeAsync`
  re-arm (~3005-3017), new `audioRecoveryInFlight` guard before `runMicRecoverySweep`
  (~3823), banner message branch.
- `frontend/src/app/pages/room/room.page.html` — no structural change; message signal already
  renders correctly (~201-204).
- Existing spec: `frontend/src/app/services/mic-sweep.spec.ts` (or equivalent) — extend for the
  new pure-reducer contract; no `Date.now()`/fake-timers needed given `now`-injection.

## Redteam-candidate decision

**YES — unanimous, both rounds, both planners independently.** Reasoning: repeated `getUserMedia`
re-acquisition against a dead/absent device is a genuine mobile battery/thrash storm risk if the
dual-bound logic has an off-by-one or the re-arm conditions don't actually cover every genuine
recovery path; the change rewrites a load-bearing pure reducer and touches three existing
recovery paths (`devicechange`, track-`ended`/mute handlers, the sweep orchestrator itself) —
regression risk (double-recovery, stale banner state, retry storm) is real enough to warrant
post-implementation adversarial review before this ships even LOCAL-only.

**Tier recommendation:** standard (4-voice: sonnet+haiku+codex55+spark, or per this run's
restricted pool {sonnet, opus, codex55, spark} — substitute spark for haiku since haiku isn't in
this run's pool). Rotating lenses: retry-storm/thrash, double-recovery regression,
purity/testability regression, re-arm-condition completeness.

## Testing note (per JROM 2026-07-03 protocol)

Reproduce-first on dev_machine before this fix is accepted: recreate the "acctg-style" dead-mic
scenario (device removed/disabled mid-call) on dev_machine via a Grok Build agent, confirm the
CURRENT one-shot-then-silent behavior reproduces, THEN validate the fix resolves it there. Peer2's
machine confirmation only after dev_machine passes.
