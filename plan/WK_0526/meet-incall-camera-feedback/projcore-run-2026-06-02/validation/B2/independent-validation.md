# Independent Validation — B2 (same-room feedback suppression, SUPPRESSION ONLY)

**Validator:** fresh-context general-purpose (Opus), Rule 11. Verifier ≠ fixer. Given ONLY the RF contract section + changes.md + the source/specs — no plan, no scenarios, no review.

## Verdict: STATUS: PASS

Independently ran (from `frontend/`): `npx tsx` on `mic-energy.spec.ts`, `feedback-limiter.spec.ts`, `remote-audio-playability.spec.ts` — all green (`all assertions passed`). Read spec bodies to confirm substance (real values / truth-table), not theater.

### Per-acceptance findings

1. **EC/NS/AGC (capture) — PASS, honestly scoped.** `audioCaptureConstraints` (mic-energy.ts:47) is the single capture chokepoint — all 4 getUserMedia paths route through `audioConstraints` → it. EC/NS/AGC requested as `{ideal:true}` (never `{exact}` → no hard-fail); `deviceId:{exact}` only when a device is chosen. The "strengthening" is honestly a verify-and-log (`unappliedAudioProcessing` + `verifyAudioProcessing` console.debug), not true enforcement — the correct call since `{exact}` would break capture. Spec truth-table verifies strict `=== false` only (undefined/0/'' not flagged).
2. **Limiter — PASS.** Real `DynamicsCompressorNode` in `ensureGraph` wired `gain → limiter → destination`; params limiter-shaped (threshold -3dB, knee 0, ratio 20:1, attack 3ms, release 250ms), no makeup gain. `DEFAULT_VOLUME===1` (no default amplification >1.0); `MAX_VOLUME===1.3` (explicit user raise only).
3. **NO UI/auto-mute/banner — PASS.** Commit touches 5 files only (2 specs + 3 services); zero component/template/HTML. Audio-graph + log only.
4. **No regression — PASS.** `setVolume`/`setMutedAll` still operate on `gain.gain.value` (upstream of limiter); mute-all gain=0 ⇒ 0 in ⇒ 0 out = true silence (limiter has no makeup gain). Playout chain intact (`destination.stream → outputElement`). `reset()` tears down + nulls the limiter. `setSinkId`/device selection untouched. media.service diff purely additive log-only.
5. **Honest doc — PASS.** changes.md states software suppression "REDUCES but cannot fully eliminate" two-device acoustic feedback; no "fixed"/"eliminated" claim.

**Note (not a fail):** live two-device same-room A/B (normal-speech-not-squashed; runaway-reduced) is hardware-only — correctly flagged for JROM's manual validation. The pure params + graph-insertion + mute-all-silence invariants are tsx-proven.

STATUS: PASS
