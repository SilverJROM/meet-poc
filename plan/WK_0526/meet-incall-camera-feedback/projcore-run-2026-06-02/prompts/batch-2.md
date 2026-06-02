/lead — HYPER-FOCUSED IMPLEMENTER for ONE batch (B2). Claude /projcore supervises + validates INDEPENDENTLY. NO scope creep. Fresh context (post-/clear).

Batch ID: B2 — Same-room feedback suppression (RF) — SUPPRESSION ONLY
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-incall-camera-feedback/projcore-run-2026-06-02
Branch: feat/incall-media-always-enableable-20260602 (B1 committed on it — CONTINUE, commit B2 on top). Do NOT touch B1's files unless required.
Read FIRST: north-star.md, og-requirements.md (RF), context-handoff.md, decisions/feedback-approach.md.
Lifecycle: post-live, Deferral OFF (tests required). Estimated: ~30min.

## JROM directive + decision
> "fix the feedback when the caller and the called is within the same location ... add a sort of filter to not let this feedback happen."
JROM DECISION (locked): **SUPPRESSION ONLY**. NO detection UI, NO auto-mute, NO warning banner. Just maximize software suppression on the audio path. (decisions/feedback-approach.md)

## The problem (diagnosed by projcore from session 5d9ec218)
Two co-located devices: device A's speaker plays device B's audio, A's mic re-captures it, loops. Per-device echo cancellation canNOT cancel a SECOND device's speaker bleed. Current capture uses `echoCancellation: { ideal: true }` (a hint). The mixer allows output volume up to MAX_VOLUME 1.3 (>1.0 amplifies, worsening a loop).

## Required (RF acceptance — see og-requirements.md) — SUPPRESSION ONLY
1. **Strengthen + verify capture constraints** (mic-energy.ts `audioCaptureConstraints`): ensure echoCancellation + noiseSuppression + autoGainControl are requested on EVERY capture path (preflight, replaceAudioTrack, AND B1's new in-call mic-acquire toggleMic). Apply them in a way that does NOT break capture on devices that reject the constraint (graceful — prefer the browser applying them when supported; do not use `{exact:true}` that hard-fails getUserMedia). Optionally verify they actually applied via `track.getSettings()` and log if not.
2. **Software feedback suppressor on the mixer OUTPUT path** (remote-audio.service.ts graph): insert a limiter/compressor (e.g. DynamicsCompressorNode tuned as a limiter, or equivalent) between gain and destination to tame runaway feedback peaks, AND ensure no DEFAULT amplification >1.0 (cap default mixer gain at 1.0; user can still raise to MAX_VOLUME 1.3 explicitly, but default must not pre-amplify into a loop). Justify the node params as named constants.
3. **NO UI**: no detection banner, no auto-mute, no warning. Suppression only.
4. **No regression**: remote-audio playout (prior B1 fix — emitted must still climb), volume()/setVolume/mutedAll/setMutedAll still work, device selection intact.
5. **Honest doc**: software reduces but cannot fully eliminate two-device acoustic feedback (headphones/muting one device = only total fix). State it in changes.md.

## Scope guards (NS5 — surgical)
- B2 ONLY (RF). Touch: `services/mic-energy.ts` (audioCaptureConstraints), `services/remote-audio.service.ts` (mixer graph: add limiter/compressor node, default-gain cap). Plus tests.
- Do NOT touch: B1's media-toggle/camera/mic-acquire files, SFU subscribe/transport, room.page layout, diagnostics, the device picker.
- Reuse the EXISTING mixer graph (ensureGraph: source→gain→destination). Insert the suppressor node in that chain; keep mute-all (gain=0) and volume semantics intact.
- Mechanism-level; document the node choice + params in decisions/.

## Plan handshake (MANDATORY)
1. Read briefs + audioCaptureConstraints (mic-energy.ts), the mixer graph (remote-audio.service.ts ensureGraph/setVolume/setMutedAll/addSource), and where every capture path builds audio constraints.
2. Reply PROPOSED: the constraint strengthening (and how you verify applied without breaking capture), the suppressor node + where in the graph + params + default-gain cap, what's unit-provable (constraint builder), files touched, regression argument (playout/volume/mute still work), risks, estimate.
3. End: `STATUS: PROPOSED — <one-line>`. WAIT for APPROVED-PLAN.

After APPROVED-PLAN: implement → build green (FE) → run tests (tsx) → deploy DEV (pm2 restart meet-poc-fe) → STATUS: DONE.

## Artifacts (under <run-dir>/validation/B2/)
scenarios.md, changes.md (Root Cause + the constraint + the graph node, + honest "can't fully eliminate" note), review.md, test-report.md, screenshots/ if applicable. decisions/ entry for the suppressor node + params.

## Completion protocol
- FIRST on finishing/blocking: append ONE line to <run-dir>/callbacks.md:
  `[projcore callback] B2 <DONE|NEEDS-CLARIFICATION|BLOCKED> <one-line>` — BEFORE prose.
- End EVERY reply with: `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>`.
