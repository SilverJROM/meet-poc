# Batch B3 — Self Review

## Scope adherence

- ✅ R3 stall detection + escalation only, reusing B2a's `scheduleRecoveryEscalation` /
  `canRunSubscribeRecovery` / `lastRecoveryEvent` as-is — none of that ladder rewritten, no second
  recovery loop built.
- ✅ Playout-recovery ladder (`decideVoiceRecovery`, `RemoteAudioService.recoverVoicePlayout`) untouched —
  only the branch AFTER it exhausts (and the previously-unconditional bytes-flat branch) changed.
- ✅ Did not touch B4 (publish recovery) or B5 (diagnostics page).
- ✅ Per-publisher only: `escalateStalledRemoteAudio(publisherClientId)` calls
  `scheduleRecoveryEscalation` with exactly the one stalled `publisherClientId` — never iterates or
  touches other publishers. Verified explicitly (not just by inspection) via the new
  `sfu-recovery-coordinator.spec.ts` test: a healthy neighbor (`alice`) has zero rung-1/rung-2/low-freq
  state after `bob`'s escalation.
- ✅ Every consumer of the removed `'mark-stalled'` kind was found (`grep -rn "mark-stalled"` across
  `frontend/src`) and updated — only `room.page.ts`'s switch case and `room-decisions.spec.ts`'s
  assertions referenced it; both updated. No dangling references remain (confirmed post-edit grep only
  matches descriptive strings/comments, not the literal kind).

## Requirement-by-requirement

- **R3a (healthy-silence vs broken):** `publisherMicEnabled === false` on the bytes-flat branch → `clear`,
  never escalates. Mic on/unknown on that same branch → `escalate-recovery`. Emitted/energy-advanced
  still short-circuits to `note-emission-advanced` before either branch is reached (unchanged, pre-B3).
- **R3b (broken-audio → tiered recovery, not just a diagnostics row):** playout ladder (resume→kickstart→
  replay→rebuild) still runs first, unchanged; only once it's exhausted does the reducer escalate into
  the coordinator. The no-RTP-at-all case escalates directly (there's nothing at the playout layer to
  recover — no bytes are arriving to resume/kickstart/replay/rebuild against).
- **R3c (per-publisher, no clobber):** addressed by construction — `escalateStalledRemoteAudio` takes a
  single `publisherClientId` and everything downstream (`scheduleRecoveryEscalation`,
  `canRunSubscribeRecovery`, the rung-1/rung-2 attempt maps, the low-frequency timer map) is already keyed
  per-publisher in the B2a/B2b machinery. Explicitly tested, not just assumed.
- **"Replace terminal mark-stalled" + reset attempts on success:** done (`escalate-recovery` kind);
  attempts-reset-on-success falls out of the pre-existing `note-emission-advanced` branch, which already
  ran before either escalation branch and already zeroed `nextAttemptsThisWindow` — no new code needed,
  verified via the pre-existing S6 test still passing unchanged.

## Risks / caveats

- **Bytes-flat + mic-unknown semantics changed:** before this batch, an unset `publisherMicEnabled` on the
  bytes-flat branch silently cleared (never escalated) — because the parameter didn't exist yet. This
  batch's read of the R3 requirement ("mic on/unknown ⇒ subscribed-no-RTP failure ⇒ coordinator") makes
  that ambiguity resolve to escalate, not clear. This is a genuine behavior change for any caller that
  doesn't pass `publisherMicEnabled` (only `room.page.ts` does today, and it now always passes
  `peer?.micEnabled`), not a hidden regression — flagged here for validator scrutiny.
- **`escalateStalledRemoteAudio` is called every watchdog poll while the stall persists** (not just once)
  — this is intentional (matches the "never a silent latched guard" mandate and the existing
  `mark-stalled`-was-called-every-poll behavior it replaces), and is safe because
  `scheduleRecoveryEscalation`/`canRunSubscribeRecovery`'s own caps and the low-frequency-timer's
  "already armed" guard prevent runaway duplicate scheduling — proven by the R3-NEVER-GIVE-UP test still
  reporting stable `nextAttemptsThisWindow` across repeated polls.
- **No new UI / no screenshots this batch:** the escalate-recovery path reuses the existing
  `markVoiceStalled()` banner as-is; nothing new is rendered. If the underlying coordinator subscribe
  recovery can't succeed either, B2b's already-shipped rung-4 "unrecovered" banner is what eventually
  surfaces — out of this batch's scope to re-prove.

## Verdict

READY for independent validation ([REDTEAM:standard] per the brief).
