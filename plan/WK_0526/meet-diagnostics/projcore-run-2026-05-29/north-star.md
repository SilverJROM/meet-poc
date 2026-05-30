# north-star — frontloaded JROM answers (append-only)

## 2026-05-29 — initial locked set

### NS1 — Scope (JROM answered)
> "Diagnostics + the audio fix"
Build BOTH: (A) all-sides diagnostics improvements + on/off switch, AND (C) the capture-side one-way-audio fix (silent-mic detection + device recovery). Not diagnostics-only.

### NS2 — Implementer + topology (JROM answered)
> "send this to a opus (/lead) on another tmux session and you validate, but please dont let it drift make him hyper focused on the task you will be the one with a wider view to catch things the hyperfocused might have missed"
- Implementer = Claude **/lead on Opus** in its OWN tmux session (`lkvc-opus`). Pattern 2 (supervisor-across-tmux).
- projcore = coordinator + **independent validator** (verifier ≠ fixer). 2-agent topology.
- **/lead is kept hyper-focused**: tight per-batch briefs, hard scope guards, one slice at a time. projcore holds the wide view, catches drift + gaps the focused implementer misses.

### NS3 — Baseline (projcore decision, JROM approved)
> "Commit baseline, exclude junk"
Baseline commit `81661dd` snapshots the week's uncommitted work (excluding test junk). /lead branches off a clean tree so its diff is reviewable in isolation.

### NS4 — Lifecycle / deferral (projcore default, post-live)
App is **live with real users** (`voice.silverjrom.app`) → lifecycle = **post-live**, but deferral kept **tight**: no TODO/FIXME, no "follow-up PR," no dead-code shims. Uncertainty → STATUS: NEEDS-CLARIFICATION, not a defer. Each slice finishes.

### NS5 — Test strategy (projcore default)
- Backend: vitest targeted tests for touched modules.
- Frontend / WebRTC audio: WebRTC mic capture can't be fully e2e'd headless — proof = targeted unit/logic tests + **manual verification on `http://localhost:4700`** + screenshots, plus a forced-silent-track path to prove the warning/`micSilent` behavior deterministically.
- Build MUST be green for BOTH `backend` and `frontend` at every gate.
- **No full 2-hr e2e capstone** for this focused run.

### NS6 — Deploy (projcore default, ALWAYS-OK)
DEV deploy = `cd backend && npm run build && cd ../frontend && npm run build` then `pm2 restart meet-poc-be meet-poc-fe`. DEV URL `voice.silverjrom.app` is served from the SAME local tree/PM2 as `localhost:4700` — so a deploy reaches the live URL JROM uses. Deploy only **after projcore PASS** on a batch (or batched at run end), never mid-implementation. PROD/QA = ALWAYS-ESCALATE (n/a here).

### NS7 — Commit / branch (projcore default — existing convention)
Conventional commits, atomic per slice. Feature branch off baseline: `feat/meet-diagnostics-audio-20260529`. Build-landed-before-gate (gate on git HEAD, not the callback).

### NS8 — Admin kill-switch guard (R5)
The global kill-switch reuses the EXISTING admin module + auth (added this week). It is a feature toggle, NOT a new auth/RBAC boundary — /lead must not invent new security boundaries (trust-defaults ALWAYS-ESCALATE). If it can't be done without touching auth, STATUS: NEEDS-CLARIFICATION.

## 2026-05-29 — injected (NS9): root cause is in OUR code + greenlight

### NS9 — Mic hardware confirmed working ⇒ fault is our capture path (JROM, verbatim)
> "ok but the user, said he can test the mic and its working then what is the problem here? is it the code? go ahead and fix this and improve the diagnostics if we can go you have greenlight go ham at this problem"

Refinement: the US user's mic **tested working** AND **worked on Google Meet** ⇒ hardware is fine; the silent published audio is **OUR bug**. Two prime suspects to root-cause in B2/R3 (not merely detect+warn):
- **(a) Wrong device captured** — app used system-default input (built-in/dead) instead of the external mic. The user "tested the mic" = the external one; our app published a different, silent one. Check: deviceId selection on join, default-fallback behavior, whether the picker's choice actually reaches getUserMedia, persistence across lobby→in-call.
- **(b) Constraint incompatibility** — `AUDIO_PROCESSING_CONSTRAINTS` forces echoCancellation/noiseSuppression/autoGainControl and constrains nothing on channels/sampleRate. Pro/USB/multi-channel external interfaces can return a silent or wrong channel under these exact constraints; Meet negotiates around it. Check: relax/repair constraints, handle multi-channel, never publish a silent track silently.

**Mandate:** B2 must ROOT-CAUSE-FIX the capture (right device + compatible constraints + no-silent-publish), with the silent-mic watchdog (detect+warn+switch) as the SAFETY NET on top. The diagnostics (B1/B4) make any recurrence provable.

**Operating mode:** GREENLIGHT / autonomous-complete — "go ham." Be aggressive and thorough; do not pepper JROM with questions. Only stop for a real §1.18 blocker. Verifier≠fixer still holds — projcore validates hard.

## 2026-05-29 — injected (NS10): device self-test must not give a false pass

### NS10 — Self-test fidelity (JROM, verbatim)
> "perhaps one thing to add here or fix is to properly fix the self test on the user, if its truly not sending it should be flagged or can be flagged by the user on his test/configure devices, its unacceptable to pass that and yet when on a call it does not work perhaps we should look into fixing that as well"

New req **R8**. The pre-call device test/configure currently can show a mic as "working" while the call publishes silence — a FALSE PASS. Fix: the self-test must exercise the SAME capture path that will be published (same device + same constraints + the R1 published-audio-level signal), and FLAG a non-working mic before join. Pre-call test must match in-call reality.

**Placement decision (projcore):** injected as batch **B5**, sequenced **right after B2** (the capture root-cause fix) — same subsystem; B5 validates that the fixed path is what the self-test measures. Coupling justifies placing it ahead of B3/B4 rather than queue-end. Depends on B1 (level signal) + B2 (capture fix). Logged to decisions/.

## 2026-05-30 — injected (NS11): multi-device mic fallback (amends AC5)

### NS11 — Fallback across available mics before warning (JROM, verbatim)
> "ok, can we use a fallback of the other available mics when one mic fails and when there is non just prompt the user about the error"

**AMENDS** the B2a guardrail AC5 ("re-acquire the SAME device only, never switch to a different concrete device"). JROM now wants automatic multi-device fallback. New recovery protocol (shared by the join-time gate AND the in-call watchdog):
1. Re-acquire CURRENT device once (relaxed) — transient/constraint catch.
2. Still silent → iterate OTHER available audioinput devices; adopt the FIRST that produces energy; switch + notify the user which device.
3. No device produces energy → keep best track (still NON-DESTRUCTIVE, never zero audio) + persistent error prompt.
4. Bounded: ONE sweep per silence episode (re-arm only if energy returns then drops); no thrash; dedupe candidates by deviceId/groupId.
Reuse classifyMicCapture + getOutboundAudioSource (no new meter). New req R10 → batch B2c, placed right after B2b.

## 2026-05-30 — injected (NS12): diagnostics admittance gate relax (JROM-approved)
JROM approved relaxing isAdmittedDiagnosticPoster's `!clientId` guard so a reconnecting guest's diagnostics aren't dropped (accept durable clientKey+participantId+wasAdmitted identity despite stale clientId, UNLESS a different live admitted peer owns that clientId). Security-neutral (clientKey is the anchor). Escalated per trust-defaults (auth boundary). Folds into B4a. See decisions/2026-05-30-diagnostics-admittance-gate-relax.md.
