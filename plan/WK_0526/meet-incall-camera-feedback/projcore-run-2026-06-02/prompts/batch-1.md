/lead — HYPER-FOCUSED IMPLEMENTER for ONE batch (B1). Claude /projcore supervises + validates INDEPENDENTLY. NO scope creep.

Batch ID: B1 — In-call mic AND camera always enable-able; never stiff (RC)
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-incall-camera-feedback/projcore-run-2026-06-02
Branch: feat/incall-media-always-enableable-20260602 (create off master @ a4c81cc). Commit on top.
Read FIRST: north-star.md, og-requirements.md (RC), context-handoff.md.
Lifecycle: post-live, Deferral OFF (tests required). Estimated: ~30min.

## JROM directive (verbatim — this is the contract)
"whatever the case pre-joining don't grey-out or unallow click of the camera or mic inside the call. just re-ask for the users permission if they want to activate it inside the call. no hard deny BS, just full customizability here, the app should not be too stiff here."

## The bug (confirmed in code by projcore)
Both in-call media toggles NO-OP when the track/stream is absent (i.e. when the user joined without that media):
- `media.service.ts` `toggleMic()`: `const track = this.localStream()?.getAudioTracks()[0]; if (!track) return false;` — never acquires.
- `media.service.ts` `toggleCamera()`: `const stream = this.localStream(); if (!stream) return false;` — never acquires when there's no local stream at all. (It DOES acquire video when a stream exists but has no video track — that path works; preserve it.)
The buttons (controls-bar.component.html) are NOT literally `disabled` — they always emit — but the action no-ops and the `is-off` styling makes them look dead.

## Required behavior (RC acceptance — see og-requirements.md)
1. **Mic:** clicking the in-call mic button when there is no live audio track → acquire one via getUserMedia (re-asking permission), add it to the local stream (create the stream if null), publish via the SFU replace/add path, set micOn. Toggling off/on afterward keeps working (flip enabled on the existing track).
2. **Camera:** clicking the in-call camera button when there is no video track → acquire via getUserMedia (re-asking permission), incl. the **no-localStream** case (create the stream), add + publish, set cameraOn. Preserve the existing working path (stream exists, no video track).
3. **Never stiff / no dead-end:** never disable or permanently lock the controls based on pre-join permission state. EVERY click on an off/absent control re-attempts acquisition. If the browser rejects with NotAllowedError (a prior hard "Block" — the ONE thing a web app cannot force a re-prompt for), DO NOT dead-end: keep the control live (so a later click retries) and show a brief, non-blocking hint on how to unblock (e.g. the address-bar camera/mic icon / site settings). No raw error dumps, no permanent disable.
4. No regression: the already-working "off-with-stream → enable", screen-share toggle, device selection, and the prior audio-playout/mic-persistence fixes.

## Scope guards (NS5 — surgical)
- B1 ONLY (RC — mic + camera in-call enable). Touch: `services/media.service.ts` (toggleMic/toggleCamera acquire paths), `pages/room/room.page.ts` (toggleMic/toggleCamera handlers + the not-allowed UX message + publish wiring), and the controls-bar/room template ONLY if needed for the non-blocking hint. Plus tests.
- Do NOT touch: B2 feedback/audio constraints (separate batch), SFU subscribe/transport internals beyond the existing publish/replace API, diagnostics, layout/grid.
- Reuse the EXISTING publish path the working camera-acquire already uses (`replaceEffectiveVideoTrack` / the SFU replace API) — mirror it for the mic acquire (`replaceAudioTrack` / sfuClient.replaceAudioTrack). Don't invent a new publish mechanism.
- Mechanism-level root cause; if reality differs from the above, fix the actual cause + document divergence with evidence.

## Plan handshake (MANDATORY)
1. Read briefs + toggleMic/toggleCamera (media.service.ts), room.page toggleMic/toggleCamera + publish helpers, controls-bar template, how the working camera-acquire publishes.
2. Reply PROPOSED: the mic-acquire path, the camera no-stream path, the re-ask/never-stiff handling + NotAllowedError UX, where a pure decision can be unit-tested, files touched, risks, estimate.
3. End: `STATUS: PROPOSED — <one-line>`. WAIT for APPROVED-PLAN.

After APPROVED-PLAN: implement → build green (FE) → run tests (tsx for any pure spec) → deploy DEV (pm2 restart meet-poc-fe) → STATUS: DONE.

## Artifacts (under <run-dir>/validation/B1/)
scenarios.md, changes.md (Root Cause + the exact no-op lines + the acquire wiring), review.md, test-report.md, screenshots/ (mic+camera enabled mid-call; blocked-hint state). decisions/ entry if a non-trivial choice.

## Completion protocol
- FIRST action on finishing/blocking: append ONE line to <run-dir>/callbacks.md:
  `[projcore callback] B1 <DONE|NEEDS-CLARIFICATION|BLOCKED> <one-line>` — BEFORE prose.
- End EVERY reply with: `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>`.
