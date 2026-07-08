# OG Requirements — Voice Standardization & Reliability (2026-07-03)

Source: live-call diagnosis of room "ReceiptBOT" (2026-07-03 09:38-10:39 AM PH), JROM's
follow-up asks in-conversation, and still-open weekly-list items unblocked by the
recording->transcription mid-joiner fix going green.

Scope: **LOCAL only** (no DEV deploy this run — JROM explicit, 2026-07-03).
Lifecycle: **pre-live** (default; no PROD; deferral OFF per `JROM/style/deferral-policy.md`).

## R1 — Persistent mic-silence self-heal (not one-shot)

The local mic-silence watchdog (`mic-energy.ts` / `room.page.ts`) currently does ONE device
sweep, then falls back to a passive, dismissible banner. Participant `acctg` rode silent for
~61 minutes in this morning's call because the sweep never retried.

Acceptance:
- Watchdog keeps retrying recovery (bounded, not infinite-storm) while the mic remains
  classified silent, instead of stopping after one sweep.
- **Active-recovery cadence: every 5-10s** while a problem is actively detected/being recovered.
- **Idle/passive-monitoring cadence: 20-30s** is acceptable when nothing is wrong (this range
  applies to the mic-silence watchdog ONLY — the WK_0701 SFU subscribe-recovery escalation
  ladder is explicitly OUT of scope for this cadence change per JROM 2026-07-03).
- Banner/warning stays visible and actionable for as long as the mic is unrecovered.

## R2 — Audio codec/bitrate hardening

Video has explicit simulcast bitrate tiers (`sfu-client.service.ts`); audio has none — no Opus
bitrate floor/ceiling, no DTX control, no RED/FEC redundancy. Left entirely to browser defaults.

Acceptance:
- Explicit Opus bitrate floor set on the audio `RTCRtpSender` (prevents extreme low-bitrate
  degradation under adverse network conditions).
- RED and/or FEC redundancy enabled for audio where supported, to survive brief packet loss/
  jitter without audible garbling.
- No regression to existing echoCancellation/noiseSuppression/autoGainControl behavior.

## R3 — Reconnect resilience (mobile/cellular)

`Farida Corpuz` (iOS Safari) churned through 6 distinct client sessions with 2 WebSocket
disconnects (code 1006, abnormal closure) in one ~61min call.

Acceptance:
- Reconnect path resumes audio with a measurably shorter gap than a full rejoin (reuse of
  session/track state where the existing WK_0701 self-heal machinery allows, without touching
  its escalation-ladder cadence per R1 scope note).
- No regression to existing WS reconnect/backoff behavior for other platforms.

## R4 — Host-facing silent/reconnecting participant indicator

Host currently has no way to know a participant is silent-at-source or mid-reconnect without
being told verbally.

Acceptance:
- Host view surfaces a visible, per-participant indicator when that participant is
  classified silent-at-source (reuses existing mic-silence classification) or is
  reconnecting (reuses existing wsHealth/reconnect state).
- Indicator does not require the host to open the diagnostics page.

## R5 — Per-voice volume balancer/normalizer

Some voices are very low volume even at max device volume; others are loud — hard to hear the
quiet ones relative to the loud ones.

Acceptance:
- Each remote participant's playback is auto-leveled toward ~85-90% of the current loudest
  speaker's level, using already-polled per-track audio-level data (no new AnalyserNode
  polling loop where the existing signal suffices).
- Capped gain (no over-amplification of noise floor; compressor guards against clipping on
  loud transients).
- Existing global volume slider remains a manual multiplier on top of the auto-leveled output,
  not replaced.
- No double-audio-graph regression (resolve the existing silenced/gain=0 active-speaker
  WebAudio graph vs. a new playout graph per peer — one architecture, not two parallel graphs).

## R6 — Room password + admission policy (per-room setting)

JROM verbatim (logged 2026-07-01, `plan/WK_0701/list/2026-07-01-room-password-admission-policy.md`):
> "i just realized another change i want to add, on the app, log this to fix on this list after
> your testing and all green, i can set a password on the room, and i also i can manually set on
> the meeting as well to auto allow joiners with password, and the ones without password needs
> my approval on the room this is a room setting, i can auto allow joiners with password or they
> still need to be admitted, so if allow w/ password, they are auto admitted, no passwords knocks
> and wait to be admitted. if all requires admisison, w/ password or not they require admission
> to the room"

Acceptance:
- Room owner can set a password on a room.
- Room-level admission-policy toggle: (a) auto-allow with correct password (no knock), wrong/no
  password still knocks; or (b) everyone requires host admission regardless of password.
- Setting is adjustable both at room-creation and live in-meeting.

## R7 — Fix pre-existing production-build Ionicons dynamic-icon-name error

Logged 2026-07-02 (`plan/WK_0701/list/2026-07-02-prod-build-ionicons-toggle-error.md`).
Production-build-only console error on any `<ion-icon [name]>` binding that dynamically
switches between two icon names (login password eye, mic/cam/record icons, star, expand
chevrons). Reproducible on the pre-existing, unmodified login page password toggle.

Acceptance:
- Error no longer fires on the production build for any affected dynamic icon-name binding.
- Regression check covers at least: login password eye/eye-off, one controls-bar icon toggle.

## Out of scope for this run

- DEV deploy / live voice.silverjrom.app validation (explicit, JROM 2026-07-03 — LOCAL only).
- WK_0701 SFU subscribe-recovery escalation ladder cadence (explicitly excluded from R1).
- Deploy-status gap for the already-merged transcript/recordings library grouping
  (commits `fb88436`..`7513020`) — separate action, not folded into this run's queue.
