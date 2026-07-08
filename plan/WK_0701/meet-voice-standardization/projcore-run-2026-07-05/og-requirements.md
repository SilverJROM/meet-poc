# OG Requirements — App Issue Closeout Continuation (2026-07-05)

Source: WK_0701 issue register, paused 2026-07-03 voice-standardization run, and JROM's
2026-07-05 greenlight to proceed autonomously with the declared team.

Scope: local implementation and validation by default. DEV deployment is allowed only where
project_specs.md treats it as DEV and the change is ready; QA/PROD, irreversible data changes,
new paid resources, and auth/RBAC boundary changes require escalation.
Lifecycle: pre-live; deferral OFF. Queue rows below gate completion.

## R1 — Persistent mic-silence self-heal

Status carried forward: implemented and independently validated on commit d2cbce9, but not merged
or deployed. Remaining acceptance for this continuation:
- Run the owed standard-tier red-team pass.
- Produce the owed post-fix regression proof for retry cadence, or document a concrete blocker.

## R2 — Audio codec/bitrate hardening

Video has explicit simulcast bitrate tiers; audio has no explicit Opus bitrate floor/ceiling,
DTX control, RED, or FEC.

Acceptance:
- Explicit Opus bitrate floor/ceiling is set on the audio RTCRtpSender where supported.
- RED and/or FEC redundancy is enabled for audio where supported, without breaking browsers that
  do not support the codec/parameter.
- Existing echoCancellation, noiseSuppression, and autoGainControl behavior does not regress.

## R3 — Reconnect resilience for mobile/cellular churn

iOS/mobile participants can churn through reconnect sessions and take too long to resume audio.

Acceptance:
- Reconnect path resumes audio with a shorter observable gap than a full rejoin where the existing
  SFU/WS self-heal state allows it.
- Existing WS reconnect/backoff behavior does not regress.

## R4 — Host-facing silent/reconnecting participant indicator

The host has no clear per-participant signal that someone is silent-at-source or reconnecting.

Acceptance:
- Host view surfaces a visible per-participant indicator for silent-at-source or reconnecting state.
- The indicator does not require opening diagnostics.
- Non-host participants do not get confusing host-only controls or false indicators.

## R5 — Per-voice volume balancer/normalizer

Quiet voices are hard to hear compared with loud voices.

Acceptance:
- Each remote participant's playback is auto-leveled toward roughly 85-90% of the current loudest
  speaker using already-polled per-track audio-level data where possible.
- Gain is capped; compressor/limiter behavior prevents clipping and avoids amplifying noise floor.
- Existing global volume remains a manual multiplier on top of auto-leveling.
- Avoid parallel competing audio graphs; pick one playout architecture.

## R6 — Room password + admission policy

Room owner can set a password and choose whether correct-password joiners auto-admit or everyone
still requires admission.

Acceptance:
- Room owner can set/update a room password.
- Admission policy supports: auto-allow with correct password, or all require host admission.
- Wrong/no password knocks and waits when policy requires it.
- Setting is adjustable at room creation and live in-meeting.

## R7 — Production-build Ionicons dynamic icon-name error

Production build throws a console TypeError when dynamic ion-icon names toggle.

Acceptance:
- Error no longer fires in production build for affected dynamic icon-name bindings.
- Regression check covers login password eye toggle and one controls-bar icon toggle.

## R8 — Transcript/recordings library grouping deploy verification

Transcript/recordings grouping is implemented on main, but deploy status was open.

Acceptance:
- Verify the grouping behavior against the intended running target.
- If target is DEV and safe under project_specs.md, deploy/restart and smoke verify.
- If target would be QA/PROD or contradicts current scope, stop and log the exact blocker.

## R9 — Preflight mic/speaker prerequisite behavior

Existing room-decisions spec expects missing mic access to report both mic and speaker prerequisites,
but production logic returns mic only.

Acceptance:
- Decide from product behavior whether the test is stale or production should flag speaker untested.
- Implement the chosen behavior and align tests.
- No regression to preflight access-only join gate.

## R10 — Pre-existing e2e fixture rot

Legacy share tests and auth fixture selectors drifted from current app/debug hooks.

Acceptance:
- Repair the logged stale selectors/debug-hook assumptions enough that the affected e2e specs reach
  their intended assertions.
- Do not change product behavior only to satisfy stale tests.
