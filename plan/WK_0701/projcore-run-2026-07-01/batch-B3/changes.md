# Batch B3 — Changes

## User Report (verbatim)

"When a client appears subscribed but receives no usable audio, the app must detect this. Acceptance:
(a) distinguishes healthy silence (publisher mic off) from broken inbound audio where
packets/bytes/energy/emitted samples are stalled or concealed; (b) stalled audio triggers recovery, not
just a diagnostics row; (c) recovery is per-publisher and does NOT destroy unrelated healthy remote
streams." (R3) — anchored to north-star #1: "Silent failure is not acceptable." JROM's own inbound
showed `audioLevel:0` + huge `concealedSamples` while nominally "subscribed."

## Root Cause (mechanism, per B0 consensus)

`decideRemoteVoiceWatchdogAction` (`room-decisions.ts`) had two dead ends that silently gave up instead
of escalating:

1. **No inbound bytes at all** (the "bytes not climbing across the sample window" branch) always
   returned `clear` — it had no way to distinguish "publisher's mic is off" (genuinely healthy) from
   "publisher is subscribed but nothing is arriving" (a broken SFU subscription), because it never
   looked at `peer.micEnabled`. Every subscribed-no-RTP failure was silently treated as normal silence.
2. **Bytes arrive but emitted/energy never advance** (the playout-stall branch) correctly ran the tiered
   playout ladder (resume → kickstart → replay → rebuild), but once that ladder's attempt window
   (`VOICE_RECOVERY_MAX_ATTEMPTS_PER_WINDOW`) was exhausted, it returned a terminal `mark-stalled` —
   which only latched a UI banner and never tried anything at the SFU-subscription layer. `BUG-REPRO-R1-
   mark-stalled-give-up` in `room-decisions.spec.ts` documented this exact give-up (repeated polls stayed
   `mark-stalled` forever).

## Design decision: reuse the B2a coordinator, don't build a second recovery loop

Per B0 consensus's prior-art disposition ("keep the `publisherMicEnabled` healthy-silence guard + the
'stalled audio escalates from playout recovery into subscription recovery' concept; drop the same-
`cfSessionId`-only `resubscribePublisher()` as a *terminal* answer"), B3 does **not** reintroduce a
standalone resubscribe path. Both broken-audio branches now return a single new `escalate-recovery` kind
that room.page.ts routes into `SfuClientService.escalateStalledRemoteAudio()` — a one-line public wrapper
around B2a/B2b's existing `scheduleRecoveryEscalation()` (same rung-1 → rung-2 → needs-rejoin → low-
frequency-never-give-up ladder subscribe failures already use). No new timers, no new attempt-cap state,
no new coalescing logic — all of that is inherited for free.

## Code Changes

### `frontend/src/app/pages/room/room-decisions.ts`
- `RemoteVoiceWatchdogAction` union: removed `'mark-stalled'`, added
  `{ kind: 'escalate-recovery'; nextSamples; nextAttemptsThisWindow }`.
- `decideRemoteVoiceWatchdogAction` input gains `publisherMicEnabled?: boolean`.
- Bytes-not-climbing branch (no inbound RTP at all): `publisherMicEnabled === false` → unchanged `clear`
  (healthy silence); otherwise (mic on, or unknown/undefined) → `escalate-recovery`. The existing
  4-sample window (`VOICE_RECOVERY_SAMPLE_WINDOW`) already serves as the "grace window" the requirement
  calls for — no new timer needed.
- Playout-ladder-exhausted branch: returns `escalate-recovery` (same samples/attempts as before) instead
  of the old terminal `mark-stalled`.
- `note-emission-advanced` (emitted/energy actually advanced since the last sample) is unchanged — it
  already resets `nextAttemptsThisWindow` to 0, which is the "reset attempts once recovery succeeds"
  requirement; no new plumbing needed there.

### `frontend/src/app/services/sfu-client.service.ts`
- New public `escalateStalledRemoteAudio(publisherClientId: string): void` — reads
  `subscribeFirstFrameAt.has(publisherClientId)` for `hasFirstFrame` (same signal the subscribe-stuck
  watchdog uses) and calls the existing private `scheduleRecoveryEscalation()`. This is the only new
  production surface in the coordinator; the ladder itself is untouched.

### `frontend/src/app/pages/room/room.page.ts`
- `observeRemoteVoiceTrack`: looks up the publisher's `PeerState` (already looked up for other checks
  elsewhere in the file) and passes `publisherMicEnabled: peer?.micEnabled` into the decision call.
- Switch statement: `'mark-stalled'` case replaced by `'escalate-recovery'` — keeps the existing visible
  `remoteAudio.markVoiceStalled()` banner (unchanged UX signal that audio is degraded) and additionally
  calls `sfuClient.escalateStalledRemoteAudio(track.publisherClientId)`. Confirmed via grep this was the
  only production consumer of the old `'mark-stalled'` kind — nothing else dangles.

### `frontend/src/app/pages/room/room-decisions.spec.ts`
- Bytes-flat `clear` test now explicitly passes `publisherMicEnabled: false` (was previously an unstated
  "mic unknown" case that happened to clear — R3 makes that ambiguity load-bearing, so the test now says
  what it means).
- New test: bytes-flat with `publisherMicEnabled: true` and with it omitted (unknown) both assert
  `escalate-recovery`, not `clear`.
- Playout-exhausted test updated to expect `escalate-recovery` instead of `mark-stalled`.
- `BUG-REPRO-R1-mark-stalled-give-up` (previously documented the give-up bug as passing-by-design)
  replaced with an equivalent block asserting the opposite: every poll after cap-exhaustion keeps
  returning `escalate-recovery` — proves the never-give-up property, not just a one-shot escalation.

### `frontend/src/app/services/sfu-recovery-coordinator.spec.ts`
- New test: `escalateStalledRemoteAudio('bob')` with both `bob` and a healthy `alice` publisher present
  — asserts the recovery event, rung-1 attempt map entry, and armed backoff timer are all scoped to
  `bob` only; `alice` has zero rung-1/rung-2/low-freq state and exactly one timer total is armed (R3c:
  per-publisher, no clobbering of healthy neighbors).

## Scope discipline

No changes to B4 (publish recovery), B5 (diagnostics page), or the playout-recovery ladder itself
(`RemoteAudioService.recoverVoicePlayout`/resume/kickstart/replay/rebuild — untouched). No new UI: the
existing "voice-stalled" banner (`markVoiceStalled`) is reused as-is for the escalate-recovery case: it
was already the visible signal for "this peer's audio needs attention," and R3 doesn't ask for a new one
(that's B2b's rung-4 "unrecovered" banner territory, already shipped).
