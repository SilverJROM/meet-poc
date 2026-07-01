# Batch B3 — Scenarios (R3: stalled remote-audio detection → recovery)

| ID | Scenario | Expected | Status |
|----|----------|----------|--------|
| S1 | Bytes-not-climbing across the sample window, `publisherMicEnabled: false` | `clear` — healthy silence, no escalation, no churn on a peer who is just silent | ✅ tsx (`room-decisions.spec.ts`) |
| S2 | Bytes-not-climbing across the sample window, `publisherMicEnabled: true` | `escalate-recovery` — subscribed-no-RTP failure, not healthy silence | ✅ tsx (`room-decisions.spec.ts`) |
| S3 | Bytes-not-climbing across the sample window, `publisherMicEnabled` omitted (unknown) | `escalate-recovery` — mic-unknown is treated as broken, not silently cleared | ✅ tsx (`room-decisions.spec.ts`) |
| S4 | Bytes arrive but emitted/energy flat; tiered playout ladder (resume→kickstart→replay→rebuild) exhausts its attempt window | `escalate-recovery` (was terminal `mark-stalled`) | ✅ tsx (`room-decisions.spec.ts`) |
| S5 | After S4's cap-exhaustion, 3 further polls with the same stalled sample | Every poll keeps returning `escalate-recovery` — never latches a silent give-up (replaces `BUG-REPRO-R1-mark-stalled-give-up`) | ✅ tsx (`room-decisions.spec.ts`) |
| S6 | Emitted samples climb after a stall (real audio resumes) | `note-emission-advanced`, `nextAttemptsThisWindow` resets to 0 — the watchdog's own attempt counter clears once recovery actually succeeds | ✅ tsx (pre-existing test, unchanged, still green) |
| S7 | `SfuClientService.escalateStalledRemoteAudio('bob')` called with both `bob` (stalled) and `alice` (healthy) in `remotePublishers` | Recovery event + rung-1 attempt map entry + armed backoff timer are scoped to `bob` only; `alice` has zero rung-1/rung-2/low-freq state; exactly 1 timer armed total | ✅ tsx (`sfu-recovery-coordinator.spec.ts`, new R3 test) |
| S8 | Muted-all / no-sample / other pre-existing branches | Unchanged (`clear`) | ✅ tsx (pre-existing tests, unchanged, still green) |

**Reuse, not reinvention:** `escalate-recovery` is a thin dispatch into B2a's existing
`scheduleRecoveryEscalation()` via one new public wrapper (`escalateStalledRemoteAudio`) — the rung-1/
rung-2/needs-rejoin/low-frequency ladder, its per-publisher keying, and its coalescing are all untouched
B2a/B2b machinery. See changes.md.

**Out of scope for B3 (approved, per brief):** B4 (publish recovery), B5 (diagnostics page), the playout-
recovery ladder itself (resume/kickstart/replay/rebuild — untouched), any new UI (the existing
"voice-stalled" banner is reused as-is).

**No new UI, no new screenshots:** B3 adds no new visible surface — the escalate-recovery path drives
the same pre-existing `markVoiceStalled()` banner the old `mark-stalled` path already drove, plus an
invisible (to the user) coordinator call. B2b's rung-4 "unrecovered" banner (already screenshotted in
batch-B2b) is what eventually shows if the coordinator itself can't recover.
