<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B3: Stalled remote-audio detection → recovery (R3)

Batch ID: batch-B3
Plan: plan/WK_0701/projcore-run-2026-07-01/implementation-plan.md
Branch: fix/sfu-selfheal-20260701 (commit on this branch)
Requirements assigned: R3
North-star anchors: #1 (silent failure not acceptable)
Lifecycle: pre-live — Deferral OFF. Read ~/.claude/JROM/style/deferral-policy.md. No TODO/dead-code/shims. Uncertainty = NEEDS-INFO.

Estimated duration: MEDIUM (atomic) — ~1-3 focused tests, tight diff. Propose a split if bigger.

Effort tier (PROJCORE-PROPOSED): high
  Mode chord: /fast OFF · Claude marker "think hard"
  Validator topology: 3-agent (validator=codex55) + [REDTEAM:standard] back-gate
  Why: real-time audio stats reasoning + must not clobber healthy neighboring streams.

Context (R2 shipped B2a+B2b — commits e33a98d/5f4a6bf):
The subscribe-path never-give-up ladder + full rejoin are DONE. B3 handles the OTHER failure shape JROM saw:
a client that is SUBSCRIBED but receives no USABLE audio (his own inbound had audioLevel:0 + huge
concealedSamples while "subscribed"). Reuse the B2a recovery coordinator — do NOT build a separate loop.

Requirements section (verbatim, R3):
"When a client appears subscribed but receives no usable audio, the app must detect this. Acceptance: (a)
distinguishes healthy silence (publisher mic off) from broken inbound audio where packets/bytes/energy/emitted
samples are stalled or concealed; (b) stalled audio triggers recovery, not just a diagnostics row; (c) recovery
is per-publisher and does NOT destroy unrelated healthy remote streams."

Observed (current state):
- `frontend/src/app/pages/room/room-decisions.ts` — `decideRemoteVoiceWatchdogAction` currently caps into
  `mark-stalled` (terminal) after N attempts; there is a `resubscribe` action shape but it does NOT escalate
  into the coordinator. `frontend/src/app/pages/room/room.page.ts` — `observeRemoteVoiceTrack` wires it +
  computes `remoteVoiceSample`. `frontend/src/app/services/remote-audio.service.ts` — playout recovery
  (resume/kickstart/replay/rebuild) + VOICE_RECOVERY_MAX_ATTEMPTS_PER_WINDOW + `voiceRecoveryWindowExhaustedWhileStalled`.
- Prior-art (preserved): `prior-art/uncommitted-resubscribe-attempt.patch` has a `publisherMicEnabled` guard +
  a `resubscribe` watchdog action — SALVAGE the micEnabled healthy-silence guard idea (B0 consensus said keep it).

Expected (acceptance criteria — assertable, per B0 consensus §Stalled Remote Audio):
1. **Healthy-silence vs broken (R3a):** `peer.micEnabled === false` → treat as healthy silence, clear/hold, NO
   SFU recovery. emitted-samples or voice-energy ADVANCED since last sample → clear the voice-stall attempts.
2. **Broken-audio → recovery (R3b), tiered:** bytes arrive but emitted/energy do NOT advance → run PLAYOUT
   recovery first (existing RemoteAudioService resume/kickstart/replay/rebuild); if still stalled after the
   playout window → ESCALATE into `scheduleRecoveryEscalation(publisherClientId, hasFirstFrame)` (the B2a
   coordinator) instead of terminal `mark-stalled`. no inbound bytes for an advertised audio track after the
   grace window while mic on/unknown → treat as subscribed-no-RTP failure → coordinator (not healthy silence).
3. **Per-publisher, no clobber (R3c):** recovery targets ONLY the stalled publisher; unrelated healthy remote
   streams are untouched. After a per-publisher recovery succeeds, reset THAT publisher's voice-watchdog attempts.
4. **Replace the terminal mark-stalled** with the escalation above — no silent give-up while mic on + advertised.

Scope:
- Implement R3 stall detection + escalation ONLY. Reuse the B2a coordinator (scheduleRecoveryEscalation,
  canRunSubscribeRecovery, lastRecoveryEvent). Do NOT touch B4 (publish recovery) / B5 (diagnostics page).
- Keep the existing playout-recovery ladder; add the escalation-after-playout-exhaust step.
- Per-publisher only. Robust outcome assertions. Tests in the fake-timed harness; wrap runs in `timeout 25`.
- Surgical. No unrelated refactors.

Plan handshake protocol (MANDATORY):
1. Read this brief + consensus.md §Stalled Remote Audio + the referenced files + the prior-art patch.
2. Reply PROPOSED: mechanism + files + risks + estimate. Confirm/counter tier.
3. End: STATUS: PROPOSED — <approach> · complexity: <x> · why: <one line>.
4. Wait for APPROVED-PLAN. If REVISE-PLAN, address + re-emit.

After APPROVED-PLAN:
5. Implement at high effort. STATUS: DONE when build + targeted tests green + terminating.

Required artifacts: batch-B3/{scenarios,changes,review,test-report,independent-validation}.md + screenshots/ if UI-observable; decisions/<date>-<slug>.md (or "none").

---

## Streaming-order mandate
**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). The first tool call BEFORE any prose tokens stream.**

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0701/projcore-run-2026-07-01/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh implementer batch-B3 <STATE> "<note>"
```
The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)
```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO
NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```
Use WORKING only for non-terminal progress. Emit terminal/handshake state directly when you have it.

## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+implementer[[:space:]]+batch-B3[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <note>`. Callback file wins if they differ.

STATUS: PROPOSED
