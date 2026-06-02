# 2026-06-02 — In-call camera/mic enable + same-room feedback

- **type:** feature + bug
- **status:** FIXED + deployed (VERIFIED; live confirmation = JROM seat)
- **agent:** projcore
- **run:** plan/WK_0526/meet-incall-camera-feedback/projcore-run-2026-06-02 (OVM #14)
- **qa_verification:** projcore independent PASS both batches (specs incl. existing remote-audio playout re-run, diffs read, builds green, live bundle==HEAD, merged master 7ef5266)

## JROM verbatim
> "allow the user to enable the camera inside the call, even when they have not allowed it prejoining the call."
> "fix the feedback when the caller and the called is within the same location ... add a sort of filter to not let this feedback happen."
> "whatever the case pre-joining don't grey-out or unallow click of the camera or mic inside the call. just re-ask for the users permission ... the app should not be too stiff here."

## Outcome
- **B1 (RC):** in-call mic+camera never stiff — clicking an off/absent control re-asks permission + acquires+publishes. Camera live-proven (e2e). Mic toggle non-stiff. JROM decision: KEEP mic-required-to-join (mic-acquire path stays defensive). NotAllowedError → dismissible hint, never a lockout.
- **B2 (RF):** same-room feedback SUPPRESSION-ONLY (JROM decision) — EC/NS/AGC verified on all capture paths + DynamicsCompressor brick-wall limiter on mixer output (gain→limiter→destination, no makeup gain, default gain 1.0). No UI/auto-mute. Honest: reduces, can't fully eliminate two-device acoustic feedback.

## Also confirmed this run
Prior B1 host-audio-playout fix VERIFIED LIVE in call 5d9ec218 (host emitted 2.7M+1.07M).

## Decisions (JROM)
- Feedback = suppression only. Mic join gate = kept. See run decisions/ + ~/.claude/JROM/decisions/2026-06-02-incall-media-and-mic-gate.md.
