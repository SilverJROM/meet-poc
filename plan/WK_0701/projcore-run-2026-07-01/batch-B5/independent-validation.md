# Batch B5 — Independent Validation

Validator: codex55
Batch: B5
Requirement: R5 — diagnostics honesty
Verdict: REPRO-CLEARED-ON-LOCAL

## R5a — 406 is not `lastGumError`

PASS.

- `frontend/src/app/services/diagnostics-gum-error.ts:5` routes `diagnosticsGumError()` through `isLastGumErrorCandidate()` before returning any `{ name, message }` device error.
- `frontend/src/app/services/sfu-subscribe-failure-evidence.ts:88` only accepts known GUM/device codes or browser media exception names. A `HttpErrorResponse` from `/api/sfu/tracks` with status 406 does not match that gate.
- `frontend/src/app/services/diagnostics-layer-honesty.spec.ts:28` is not a fake/vacuous test: it constructs a real `HttpErrorResponse` 406, asserts `diagnosticsGumError(err) === null`, extracts subscribe evidence, builds the layer snapshot, then asserts `layers.device.lastGumError === null` and `layers.subscribe.httpStatus === 406`.

## R5b — Separate Per-Layer Diagnostics Fields

PASS.

- `frontend/src/app/services/meeting-sessions.service.ts:356` adds `DiagnosticsLayerSnapshot` with separate `device`, `publish`, `subscribe`, `recovery`, `playout`, `remoteInbound`, and `advertisedNotSubscribed` fields.
- `frontend/src/app/services/diagnostics-layer-snapshot.ts:23` builds those fields from the existing live signals supplied by the room page: `lastGumError`, `localPublishState`, `publishRecoveryFailed`, `lastSubscribeFailureEvidence`, `lastRecoveryEvent`, `sfuRejoinThrottled`, `remoteAudioPlayout`, `sfuDiagnostics.inboundTracks`, and `advertisedRemotePublisherDiagnostics()`.
- `frontend/src/app/pages/room/room.page.ts:3953` wires `layerDiagnostics` into the posted diagnostics payload. I did not find fabricated recovery, subscribe, playout, or remote-inbound values in the app code path.

## R5c — Advertised-Not-Subscribed Visible

PASS.

- `frontend/src/app/pages/diagnostics/diagnostics.page.ts:158` builds the layer rows, including Subscribe `HTTP 406` as `layer-bad`.
- `frontend/src/app/pages/diagnostics/diagnostics.page.ts:214` builds advertised-not-subscribed rows with publisher name, track names, and action hint.
- `frontend/src/app/pages/diagnostics/diagnostics.page.html:98` renders the Layer diagnostics grid and `:125` renders the Advertised not subscribed block.
- Screenshot verified: `plan/WK_0701/projcore-run-2026-07-01/batch-B5/screenshots/b5-layer-diagnostics-advertised-not-subscribed.png` is an actual diagnostics page. It shows Device, Publish, Subscribe, Recovery, Playout, and Remote inbound rows; Subscribe shows `HTTP 406 · POST /api/sfu/tracks · session_not_found`; Advertised not subscribed shows Bob / `bob-audio` and an action hint.

## Scope Audit

PASS.

- `git diff --name-only` shows no `frontend/src/app/services/sfu-client.service.ts` change.
- Named recovery methods from the brief are untouched in this batch: `scheduleRecoveryEscalation`, `runFullSfuRejoin`, and `escalatePublishFailure`.
- B5 changes are limited to diagnostics payload typing, diagnostics page display, room diagnostics wiring, and B5 tests/evidence. Existing plan/progress/callback files are also dirty from orchestration.

## Verification

PASS.

Commands run:

```bash
cd frontend && timeout 30 npx tsx src/app/services/diagnostics-layer-honesty.spec.ts
```

Result: PASS — `diagnostics-layer-honesty: all assertions passed`

```bash
cd frontend && timeout 30 npx tsx src/app/pages/diagnostics/diagnostics.page.spec.ts
```

Result: PASS — `diagnostics page network path helpers: all assertions passed`

```bash
cd frontend && timeout 120 npx ng build
```

Result: PASS. Warnings only: Stencil empty-glob and MediaPipe CommonJS optimization warning.

```bash
cd e2e && E2E_BASE_URL=http://localhost:4700 timeout 190 npx playwright test tests/sfu-b5-diagnostics-layer/sfu-diagnostics-layer.spec.ts --workers=1
```

Result: PASS — 1/1 chromium test passed.

## Final Verdict

R5a, R5b, and R5c hold. The tests assert the required outcomes, the screenshot evidence is valid, and I found no B5 recovery-logic scope creep.

STATUS: REPRO-CLEARED-ON-LOCAL — R5 diagnostics honesty validated locally
