# Independent Validation — Batch-1 (R1)

Validator: Codex independent validator  
Commit audited: `d2cbce9c69edd0842169b1a5b28bb09bb142adb0`  
Date: 2026-07-03T22:32:23Z

## Verdict: PASS

The committed code satisfies R1's bounded persistent mic-silence self-heal requirement against the R1 acceptance criteria and the T1 consensus design. I read the R1 requirement anchor, the consensus design, the actual commit diff, and the implementer artifacts. I also ran the requested commands locally; both are green.

## Evidence Checklist

### (a) `nextSweepGate` purity / no internal `Date.now()`

PASS. `frontend/src/app/services/mic-energy.ts:346` now takes injected `now: number`, and the executable reducer body has no `Date.now()` call. `rg -n "Date\\.now|nextSweepGate|MIC_SWEEP|INITIAL_SWEEP_GATE_STATE|SweepGateState" frontend/src/app/services/mic-energy.ts frontend/src/app/pages/room/room.page.ts frontend/src/app/services/mic-sweep.spec.ts` found only a comment in `mic-energy.ts:335` mentioning `Date.now()`, with actual `Date.now()` calls in `room.page.ts` call sites/completion handling.

### (b) Dual bounds fire independently

PASS. `frontend/src/app/services/mic-energy.ts:320-329` computes exhaustion as:

```ts
state.attempts >= maxAttempts ||
(state.episodeStartedAt > 0 && now - state.episodeStartedAt >= maxDurationMs)
```

These are separate OR conditions. The spec also proves each independently: attempts exhaustion with duration not elapsed at `frontend/src/app/services/mic-sweep.spec.ts:306-313`, and duration exhaustion with attempts below max at `frontend/src/app/services/mic-sweep.spec.ts:315-322`.

### (c) Cooldown measured from sweep completion

PASS. `nextSweepGate` preserves `nextAllowedAt` on consumption (`frontend/src/app/services/mic-energy.ts:373-379`) and does not set cooldown at sweep start. The caller sets cooldown only in `runMicRecoverySweep()` `finally`, after the sweep body finishes: `frontend/src/app/pages/room/room.page.ts:3596-3601` sets `nextAllowedAt: Date.now() + MIC_SWEEP_RETRY_INTERVAL_MS`.

### (d) Guard against racing `audioRecoveryInFlight`

PASS. The guard is declared and wired at both silence-triggered sweep call sites:

- Initial capture-energy path: `frontend/src/app/pages/room/room.page.ts:3501-3507`
- In-call silence watchdog path: `frontend/src/app/pages/room/room.page.ts:3822-3843`

Both call `runMicRecoverySweep()` only when `gate.shouldSweep && !this.audioRecoveryInFlight`. The track-failure path sets and clears `audioRecoveryInFlight` around local audio recovery at `frontend/src/app/pages/room/room.page.ts:3418-3435`.

Residual note: the gate state is updated before the `audioRecoveryInFlight` check, so an unusual state with `audioRecoveryInFlight === true` while `micActive === true` could consume attempts without running a sweep. In the normal track-ended/mute path, `micActive` becomes false first and the watchdog re-arms before reaching the gate, so I am not treating this as a blocker for the requested race guard.

### (e) `devicechange` re-arms the gate

PASS. `handleDeviceChangeAsync()` resets `this.micSweepGateState = { ...INITIAL_SWEEP_GATE_STATE }` immediately after `refreshDevices()` at `frontend/src/app/pages/room/room.page.ts:3008-3012`, matching the consensus requirement that newly plugged devices reset the retry budget.

### (f) Actual verification commands

PASS. I ran both commands locally from the requested repo/branch.

```bash
cd /home/agjrom/websites/meet-poc/frontend && npx tsx src/app/services/mic-sweep.spec.ts
```

Result: exit 0, output `mic-sweep: all assertions passed`.

```bash
cd /home/agjrom/websites/meet-poc/frontend && npm run build
```

Result: exit 0, Angular build completed. Warnings were pre-existing/general: Stencil empty-glob and `@mediapipe/selfie_segmentation` CommonJS optimization warning.

### (g) Scope creep

PASS. Commit file list is limited to the R1 target surface:

- `frontend/src/app/services/mic-energy.ts`
- `frontend/src/app/pages/room/room.page.ts`
- `frontend/src/app/services/mic-sweep.spec.ts`

No unrelated modules, backend code, deployment files, or UI structure were touched. This matches the consensus target list for R1.

## Implementer Artifact Audit

The implementer `changes.md`, `test-report.md`, `review.md`, and `scenarios.md` are broadly consistent with the actual diff. The notable gap is that the implementer report still lists real-device/manual dev-machine regression as pending, so this validation is a LOCAL code/test/static-wiring approval, not a live-device proof.

STATUS: DONE
