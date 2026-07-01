<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B5: Diagnostics honesty — 406 is not a mic error (R5)

Batch ID: batch-B5
Plan: plan/WK_0701/projcore-run-2026-07-01/implementation-plan.md
Branch: fix/sfu-selfheal-20260701 (commit on this branch)
Requirements assigned: R5
North-star anchors: observability — diagnostics must identify the failing layer correctly.
Lifecycle: pre-live — Deferral OFF. No TODO/dead-code/shims. Uncertainty = STATUS: NEEDS-INFO.

Estimated duration: SHORT/MEDIUM (atomic). ~1-3 focused tests, tight diff.

Effort tier (PROJCORE-PROPOSED): medium
  Mode chord: /fast n/a (grok) · grok reasoning-effort medium
  Validator topology: 3-agent (validator=codex55)
  Why: mostly a data-plumbing/labeling change in the diagnostics payload — no recovery logic changes.

Context (R1-R4 shipped: 6643a02 e33a98d 5f4a6bf fc05c58 8b6825d):
JROM's observability complaint: `/api/sfu/tracks` failures (incl. 406) were being stored in diagnostics as
`lastGumError` — misleading, because those are SFU subscribe/track errors, NOT getUserMedia/mic-permission
failures. B5 makes diagnostics tell the truth about WHICH LAYER failed.

Requirements section (verbatim, R5):
"Diagnostics must identify the failing layer correctly. Acceptance: (a) /api/sfu/tracks failures are NOT
recorded as lastGumError; (b) diagnostics include separate fields for device, publish, subscribe, recovery,
playout, and remote-inbound stats; (c) diagnostics page or payload makes advertised-not-subscribed obvious
and actionable."

Existing infra to REUSE (do NOT rebuild):
- `frontend/src/app/services/sfu-subscribe-failure-evidence.ts` (from B1): `SubscribeFailureEvidence`,
  `extractSubscribeFailureEvidence()`, `isLastGumErrorCandidate()` — the 406-is-not-GUM primitive ALREADY EXISTS.
- `frontend/src/app/services/sfu-client.service.ts`: `lastSubscribeFailureEvidence` signal (already populated on
  subscribe failure), `lastRecoveryEvent` (rung/publisher/epoch), `sfuRejoinThrottled`, `publishRecoveryFailed`.
- `frontend/src/app/pages/room/room.page.ts`: `lastGumError` signal (~535, set ~3898/4002 via
  `diagnosticsGumError()`), `collectDiagnostics()`, `advertisedRemotePublisherDiagnostics()` (already computes
  quality 'advertised-not-subscribed').
- `frontend/src/app/services/meeting-sessions.service.ts`: `DiagnosticsPayload` type (lastGumError, peers,
  advertisedAudioTrackNames, advertisedSubscribed, etc).
- `frontend/src/app/pages/diagnostics/diagnostics.page.ts`: renders the payload.

Expected (acceptance criteria — assertable):
1. **R5a — 406 not lastGumError:** ensure a `/api/sfu/tracks` failure (406 or other) is NOT written to
   `lastGumError`. `lastGumError` must be device/getUserMedia-only. Use `isLastGumErrorCandidate()` to gate what
   may go into lastGumError. Reproduce-first: a test showing a 406 currently reaching lastGumError (or the risk),
   then the fix routes it to the subscribe field.
2. **R5b — per-layer fields:** DiagnosticsPayload gains SEPARATE fields: device (existing lastGumError),
   publish (localPublishState/publishRecoveryFailed), subscribe (lastSubscribeFailureEvidence), recovery
   (lastRecoveryEvent — rung/throttle), playout (remote audio playout stats), remote-inbound (per-publisher
   inbound RTP/energy/concealed). Wire the existing signals into these fields; add any missing plumbing.
3. **R5c — advertised-not-subscribed obvious+actionable:** the diagnostics page/payload surfaces
   advertised-not-subscribed clearly (it's already computed in advertisedRemotePublisherDiagnostics — make it
   prominent/actionable, e.g. a distinct row/flag). User-visible → capture a rendered screenshot of the
   diagnostics page showing the per-layer fields + advertised-not-subscribed.

Scope:
- Implement R5 diagnostics honesty ONLY. Do NOT change recovery logic (R2/R3/R4 are done + validated) — only
  wire their signals into the payload + fix the lastGumError mislabeling.
- Reuse isLastGumErrorCandidate + the existing evidence/recovery signals.
- Robust outcome assertions (a subscribe/406 error lands in the subscribe field, NOT lastGumError). Wrap tests in timeout 25.
- Surgical.

Plan handshake protocol (MANDATORY):
1. Read this brief + the referenced files.
2. Reply PROPOSED: mechanism + files + risks + estimate. Confirm/counter tier.
3. End: STATUS: PROPOSED — <approach> · complexity: <x> · why: <one line>.
4. Wait for APPROVED-PLAN. If REVISE-PLAN, address + re-emit.

After APPROVED-PLAN:
5. Implement at grok reasoning-effort medium. STATUS: DONE when build + targeted tests green + terminating.

Required artifacts: batch-B5/{scenarios,changes,review,test-report,independent-validation}.md + screenshots/ (R5c diagnostics page); decisions/<date>-<slug>.md (or "none").

---

## Streaming-order mandate
**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). The first tool call BEFORE any prose tokens stream.**

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0701/projcore-run-2026-07-01/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh implementer batch-B5 <STATE> "<note>"
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
grep -E '^\[projcore ACK\][[:space:]]+implementer[[:space:]]+batch-B5[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <note>`. Callback file wins if they differ.

STATUS: PROPOSED
