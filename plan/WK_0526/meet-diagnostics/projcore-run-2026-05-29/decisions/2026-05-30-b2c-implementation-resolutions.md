---
date: 2026-05-30
project: meet-poc
type: autonomous-call
source: lead
references: 2026-05-30-multi-device-mic-fallback-amends-ac5.md
priority: high
search_hooks: [mic-sweep, runMicSweep, never-zero-audio, restore-original, decideMicRecovery-stepfn, nextSweepGate, B2c-design]
---

# B2c — implementation resolutions (settled at the PROPOSED→APPROVED-PLAN handshake)

Three design calls were made implementing R10 ([[2026-05-30-multi-device-mic-fallback-amends-ac5]]). All confirmed by the projcore supervisor at the plan handshake — recorded so they are never re-litigated.

**1. All-fail behavior = RESTORE the originally-selected device (projcore Q2 = YES).**
- When NO available mic produces energy, the sweep restores the user's original device (non-destructive re-acquire) before showing the terminal warn — rather than stranding them on whichever silent candidate happened to be tested last.
- Reasoning: faithful "keep best existing track"; the user keeps their chosen mic + their persisted preference is untouched. The sweep physically swaps each candidate onto the sender to measure outbound energy (the one-meter design needs the candidate published), so without a restore the live track would be a random silent device.
- Counterfactual /lead considered: leave the user on the last-tested device (simpler, one fewer getUserMedia). Rejected by JROM/projcore as user-hostile.

**2. Proof strategy = unit/integration with `replaceAudioTrack` MOCKED; NO fake-media adoption test; NO constrained Playwright (projcore Q1).**
- Chrome `--use-fake-device-for-media-stream` emits a TONE on every fake input (established in B2a/B2b), so a silent-primary→working-secondary adoption CANNOT be forced headless at the media-source/getStats layer. Fabricating one would be test theater (lead.md Rule 11).
- Instead: the sweep loop is a PURE async orchestrator `runMicSweep(originalDeviceId, hooks)` in mic-energy.ts with injected hooks; the test injects candidates that throw/return-null/return-silent/return-working and asserts adoption order, restore, skip-non-fatal, AND a modeled live-track count that stays `>= 1` across the whole sweep + at exit (the never-zero-audio invariant proven in the WIRING, not just the pure decision). Real multi-device adoption stays a MANUAL localhost:4700 USER-seat note (NS5).

**3. Design fold: ONE current-first `decideMicRecovery` step fn, not separate reacquire/sweep phases.**
- qa's scenarios.md independently proposed `nextMicRecoveryStep` with explicit `'reacquire-same-device'`/`'sweep-other-devices'` phases + a `buildSweepCandidates` that EXCLUDED the current device. The implementation folds these: `decideMicRecovery` returns `'try-device'|'keep-and-warn'|'none'` walking an ordered candidate list whose FIRST entry IS the current device — so "re-acquire current once, then sweep others" falls out of the ordering. The "switched to X" notice is suppressed when the adopted deviceId === the original (a re-acquire is not a switch).
- The sweep-gate uses a single-`swept` model (`nextSweepGate`), which is the only formulation that keeps "mute is a pause, not a permanent consume" self-consistent (a post-unmute silent episode still gets exactly one sweep). scenarios.md explicitly permitted folding/renaming ("assert behavior, not names"); projcore approved the folded shape.

**Outcome:** B2c landed @ commit `4a50da2` on feat/meet-diagnostics-audio-20260529. All invariants (non-destructive/never-zero, bounded one-sweep-per-episode, mute-gated, U-8 quiet-but-working-never-swept, no-new-meter, single warn surface) preserved and independently validated.
