# Batch 2 Changes — Same-room feedback suppression (SUPPRESSION ONLY)

## Branch / Cut from
- Branch: `feat/incall-media-always-enableable-20260602` (B2 committed on top of B1; NOT a new branch).
- Cut from: B1 head `dcda820`.

## User Report (verbatim from brief)
> "fix the feedback when the caller and the called is within the same location ... add a sort of filter to not let this feedback happen."

JROM decision (locked): SUPPRESSION ONLY — NO detection UI, NO auto-mute, NO warning banner.

## Root Cause (mechanism-level)
Two co-located devices acoustically couple: device A's speaker plays B's audio, A's
mic re-captures that speaker bleed, and the loop re-amplifies each round trip. Two
mechanism facts:
1. Per-device `echoCancellation` (an AEC modelling the device's OWN render path)
   cannot cancel a SECOND physical device's speaker bleed — it has no reference for
   the other device's output, so capture-side AEC alone cannot break the loop.
2. The output mixer graph was `source → gain → destination` with **no peak limiter**.
   With nothing bounding the mixed output, a feedback loop's gain compounds on every
   pass and escalates without limit (the runaway howl).

Fix = two suppression layers: (a) keep requesting EC/NS/AGC on capture (best-effort
`{ideal}`) and surface when a device declines them (diagnostic only); (b) insert a
brick-wall limiter downstream of the volume gain so the mixer output peak is CAPPED —
a residual loop is bounded, not escalating.

## Code Changes (per file: WHAT + WHY, named function/binding)

### frontend/src/app/services/mic-energy.ts
- ADDED `type AudioProcessingSettings` and pure helper `unappliedAudioProcessing(settings)`.
  WHAT: returns the names (`echoCancellation`/`noiseSuppression`/`autoGainControl`)
  that came back STRICTLY `=== false` from `track.getSettings()`; absent/undefined keys
  and non-boolean falsy values (0, '') are NOT flagged; deterministic check order.
  WHY: lets media.service log which processing a device declined without enforcing it.
  Pure, framework-free, tsx-testable.
- `audioCaptureConstraints` UNCHANGED — EC/NS/AGC stay `{ideal:true}` (graceful; NOT
  switched to `{exact}` which would hard-fail getUserMedia on devices that can't honour
  them). No behavior change.

### frontend/src/app/services/media.service.ts
- IMPORT extended: added `unappliedAudioProcessing` + `type AudioProcessingSettings`
  from `./mic-energy` (alongside existing `audioCaptureConstraints`).
- ADDED private `verifyAudioProcessing(track)` — LOG-ONLY: calls
  `unappliedAudioProcessing(track.getSettings())` and `console.debug`s the result if
  non-empty; `try/catch` swallows `getSettings`-unsupported. Zero behavior change: no
  track/constraint mutation, no branch, no early return, no state/signal write.
- CALL SITES (2, both after a fresh audio track is obtained): `replaceAudioTrack`
  (after `nextTrack`, before `stream.addTrack`) and `toggleMic` acquire path (after
  `nextTrack`, before stream attach). B1's acquire logic / return values / control flow
  untouched.

### frontend/src/app/services/remote-audio.service.ts
- ADDED exported constant `FEEDBACK_LIMITER_PARAMS = { threshold: -3, knee: 0, ratio: 20,
  attack: 0.003, release: 0.25 } as const` near DEFAULT_VOLUME/MAX_VOLUME (importable by
  the spec). dB / dB / :1 / s / s — brick-wall limiter; NO makeup gain.
- ADDED private field `limiter: DynamicsCompressorNode | null = null`.
- `ensureGraph()`: creates + configures the limiter from the constants (sets
  `.threshold/.knee/.ratio/.attack/.release` `.value`), and rewired the output edge from
  `gain → destination` to **`gain → limiter → destination`**. Sources still
  `connect(this.gain)` (unchanged in `addSource`).
- `reset()`: now `this.limiter?.disconnect()` + `this.limiter = null` alongside the
  gain/destination teardown.
- UNCHANGED: `setVolume` / `setMutedAll` / `addSource` / `removeSource` /
  `bindOutputElement` semantics; gain remains the volume/mute node; DEFAULT_VOLUME=1,
  MAX_VOLUME=1.3; persisted-volume restore not clamped; `setSinkId`/device selection.

### Tests
- `mic-energy.spec.ts` EXTENDED (same `node:assert` + "all assertions passed" convention):
  RF1-S1 (audioCaptureConstraints still EC+NS+AGC `{ideal}`, no `{exact}`, deviceId
  `{exact}` only when given, audio:false⇒false, undefined/'' device⇒no deviceId) and
  RF1-S2 (full `unappliedAudioProcessing` truth table incl. undefined⇒[] and 0⇒[]).
- `feedback-limiter.spec.ts` ADDED: imports `FEEDBACK_LIMITER_PARAMS`; asserts exact
  values + shape predicates (ratio≥20, threshold≤0, knee===0, attack>0, release>0) +
  no `makeupGain` field (mute-all silence proof).

## Commits
- `85749cb` [batch-2] same-room feedback suppression: output brick-wall limiter (gain->limiter->destination) + capture EC/NS/AGC verifier log | scenarios: S1-S11

## Standing Rules (if discovered)
- `DynamicsCompressorNode` with no makeup gain is the load-bearing invariant for
  mute-all silence: 0-amplitude in ⇒ 0-amplitude out. Any future post-limiter gain node
  or makeup gain would break RF4-S9 (gain=0 must equal silence).

## Verification
- Build: **PASS** — `npx ng build` from `frontend/` emitted `dist/meet-poc-frontend`
  (only pre-existing warnings: stencil empty-glob, @mediapipe non-ESM).
- Specs (`for f in src/app/services/*.spec.ts; do npx tsx "$f"; done` from `frontend/`):
  ALL PASS except `sfu-client.spec.ts`, which fails identically on the pre-B2 baseline
  (verified via `git stash`) — PRE-EXISTING, imports browser-only deps, unrelated to B2.
  Notably green: `mic-energy.spec.ts`, `feedback-limiter.spec.ts`,
  `remote-audio-playability.spec.ts` (B1 playout decision — no regression).
- DEV deploy: **DONE** — `pm2 restart meet-poc-fe` → online.

### Regression guard (held)
- Playout chain still terminates `destination.stream → outputElement` (limiter is
  inserted upstream of destination; `bindOutputElement` unchanged).
- `setVolume`/`setMutedAll` operate on `gain` (upstream of the limiter) — unchanged.
- mute-all `gain=0` ⇒ silence: limiter has no makeup gain ⇒ 0 in / 0 out (asserted in
  feedback-limiter.spec.ts).
- Device selection / `setSinkId` untouched.

## HONEST LIMITATION (RF5-S11)
Software suppression **REDUCES but cannot fully eliminate** two-device acoustic
feedback. Headphones — or muting one of the two co-located devices — remains the ONLY
total fix. Specifically:
1. Capture-side EC/NS/AGC are best-effort `{ideal}`: a device may decline them (a
   second device's speaker bleed has no AEC reference anyway). When declined it is
   SURFACED via the `unappliedAudioProcessing` `console.debug`, NOT enforced.
2. The output limiter CAPS the mixer peak (suppression) — it bounds a runaway howl so
   it cannot escalate, but a residual, non-escalating loop can remain. The limiter is
   peak control, NOT detection or auto-mute.

This batch does not claim feedback is "fixed" or "eliminated" — only reduced/suppressed
and bounded.

## Caveats
- **PRE-EXISTING**: `sfu-client.spec.ts` fails under `tsx` (imports browser-only
  runtime) on baseline too — not introduced or affected by B2. Left untouched.
- **PRE-EXISTING**: build warnings (stencil `empty-glob`, `@mediapipe/selfie_segmentation`
  non-ESM) predate B2.
- Live two-device same-room A/B (RF2-S6 normal-speech-not-squashed, RF2-S7
  runaway-reduced) is JROM hardware-only and not executable here — flagged for JROM's
  live validation. The pure params + graph-insertion + mute-all-silence proofs are
  covered by the tsx specs.
