<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B4: Publish/PeerConnection-failure recovery (R4) — the Glory case

Batch ID: batch-B4
Plan: plan/WK_0701/projcore-run-2026-07-01/implementation-plan.md
Branch: fix/sfu-selfheal-20260701 (commit on this branch)
Requirements assigned: R4
North-star anchors: #1 (silent failure not acceptable)
Lifecycle: pre-live — Deferral OFF. No TODO/dead-code/shims. Uncertainty = NEEDS-INFO.

Estimated duration: MEDIUM (atomic). ~1-3 focused tests, tight diff. Propose a split if bigger.

Effort tier (PROJCORE-PROPOSED): high
  Mode chord: /fast OFF · Claude marker "think hard"
  Validator topology: 3-agent (validator=codex55) + [REDTEAM:standard] back-gate
  Why: local publish/PC lifecycle + must not clobber a healthy publish; upgraded to high per B0 consensus (participant-breaking).

Context (R1/R2/R3 shipped: 6643a02, e33a98d, 5f4a6bf, fc05c58):
The subscribe-side self-heal + stalled-audio detection are done. B4 is the PUBLISH side — the Glory case from
call 2: an admitted client with `hasPc:false` / `publishStatus:null|error` after joining. Their media never
published, so everyone sees them advertised-not-subscribed and they themselves hear no one.

Requirements section (verbatim, R4):
"If an admitted user has no SFU PeerConnection or failed publish state (hasPc:false, publishStatus:null/error)
after joining, the app must recover. Acceptance: (a) the app identifies the state as media-not-published; (b)
it retries publish or rejoins SFU without requiring the user to leave the room manually; (c) if unrecoverable,
the UI tells the user exactly what failed."

Observed (existing infra to REUSE — do not reinvent):
- `frontend/src/app/services/sfu-client.service.ts`: `localPublishState` signal (status 'publishing'|'published'|'error'),
  `isLocalPublishHealthy()`, `handleTransportStateChange` 'capped' branch (~L805, planSfuTransportRecovery /
  SFU_TRANSPORT_RECOVERY_CAP — B2b red-team confirmed this is R4/B4; it currently "defers to publish recovery path").
  The B2b rung-3 rejoin (`runFullSfuRejoin`/`handleNeedsRejoinTrigger`) already does a full session rotation +
  republish via the transportRecoveryHandler.
- `frontend/src/app/pages/room/room.page.ts`: `rejoinAfterInitialPublishFailure()`, `publishInitialSfuWithRetry()`,
  `initialPublishFailureNotice` signal (the existing "couldn't start your audio — rejoin" banner).

Expected (acceptance criteria — assertable):
1. **R4a detect media-not-published:** after join settles (grace window), detect an admitted local client whose
   publish never established — `hasPc:false` OR localPublishState status null|'error' (never reached 'published').
   Distinguish from a healthy 'published' state and from an in-progress 'publishing'.
2. **R4b auto-recover without manual leave:** retry publish (publishInitialSfuWithRetry) or, on retry exhaustion,
   escalate to a full SFU rejoin (reuse runFullSfuRejoin / the transport-recovery republish path) — NO manual
   leave/rejoin required from the user. Bounded + throttled (reuse the rung-3 throttle; no publish storms).
2b. Wire the handleTransportStateChange 'capped' path (currently a dead-end deferral) into this publish-recovery
    so a capped ICE transport recovery escalates to publish-retry/rejoin instead of silently stopping.
3. **R4c unrecoverable → explicit UI:** if publish cannot be established after bounded retry+rejoin, surface an
   explicit, actionable notice stating exactly what failed (reuse/extend initialPublishFailureNotice). Not a
   silent latched state. User-visible → capture a rendered-DOM/screenshot proof.

Scope:
- Implement R4 publish/PC recovery ONLY. Reuse localPublishState, publishInitialSfuWithRetry, runFullSfuRejoin,
  the initialPublishFailureNotice banner. Do NOT touch B5 (diagnostics page) beyond emitting events.
- Must NOT clobber a HEALTHY publish (guard on isLocalPublishHealthy / status 'published').
- Bounded/throttled — no publish retry storms. Tests fake-timed, wrap in `timeout 25`, assert OUTCOMES.
- Surgical. No unrelated refactors.

Plan handshake protocol (MANDATORY):
1. Read this brief + the referenced files + the B2b rung-3 rejoin code.
2. Reply PROPOSED: mechanism (how you detect media-not-published, how you retry vs rejoin, how you surface
   unrecoverable) + files + risks + estimate. Confirm/counter tier.
3. End: STATUS: PROPOSED — <approach> · complexity: <x> · why: <one line>.
4. Wait for APPROVED-PLAN. If REVISE-PLAN, address + re-emit.

After APPROVED-PLAN:
5. Implement at high effort. STATUS: DONE when build + targeted tests green + terminating.

Required artifacts: batch-B4/{scenarios,changes,review,test-report,independent-validation}.md + screenshots/ (R4c UI); decisions/<date>-<slug>.md (or "none").

---

## Streaming-order mandate
**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). The first tool call BEFORE any prose tokens stream.**

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0701/projcore-run-2026-07-01/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh implementer batch-B4 <STATE> "<note>"
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
grep -E '^\[projcore ACK\][[:space:]]+implementer[[:space:]]+batch-B4[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <note>`. Callback file wins if they differ.

STATUS: PROPOSED
