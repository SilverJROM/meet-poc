Batch-DIAGB2: Reliability + observability (DR-1 screen-share helper, DR-2 diagnostics + force-relay toggle, DR-3 WS-reconnect)

Batch ID: diagb2
Requirements: DR-1, DR-2, DR-3 (full text in plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/og-requirements.md)
Branch: continue on fix/meet-conn-diag (current tip, carries Batch A + diag1cf + diagb1).

**Protocol: projcore v2.0.** Plan handshake first (STATUS: PROPOSED → wait for APPROVED-PLAN → code). Final action of every STATUS reply: append `[projcore callback] diagb2 <STATE> <note>` to the run callbacks.md. End every reply with `STATUS: <verb> — <reason>`.

## Requirements (summary — verbatim in og-requirements.md DR-1/2/3)

- **DR-1 Screen-share helper.** When `getDisplayMedia()` fails/blocked (macOS Screen Recording not granted / Chrome not restarted), show a clean in-app panel: enable Screen Recording for Chrome in System Settings → fully quit & reopen Chrome (Cmd+Q). Replaces dumping the user into raw Chrome dialogs. Cannot remove the OS dialog. No dead buttons (browser can't open System Settings — written steps OK). Soft-light theme.
- **DR-2 Per-peer diagnostics panel + FORCE-RELAY TOGGLE.**
  - Per peer connection: track + expose `connectionState`, `iceConnectionState`, `iceGatheringState`, `signalingState`, and selected candidate type (host/srflx/**relay**) via `getStats()`. Visible diagnostics panel (toggle from controls or a dev affordance) listing each remote peer + live states. Console-log state transitions with peer id + timestamp.
  - **Force-relay toggle:** a UI toggle that recreates peer connections with `iceTransportPolicy: 'relay'` — forces ALL media through TURN, bypassing direct P2P. This is the definitive DR-8 diagnostic: if a cross-network call works with force-relay ON, it proves TURN is the fix and the issue was NAT traversal. Persist the toggle (localStorage) so it survives reload during testing. Default OFF.
- **DR-3 WS auto-reconnect hardening.** Verify the signaling WS reconnects on drop; add exponential-backoff reconnect (cap ~30s) + re-sync on reconnect (re-announce presence, re-request peer/room state). Leverage the DR-9 authoritative pending-list broadcast for the resync. Log connect/disconnect/reconnect transitions. NOTE: diagb1's DR-9 already made the pending-list authoritative + the WS-reconnect creates a new clientId (codex flagged this in the original PROPOSED) — handle stale peer cleanup on reconnect.

## Observed (confirm by reading)

- `frontend/src/app/services/webrtc.service.ts` — peer state tracking (diagb1/Batch A already added some connection/ice listeners + candidate logging for DR-4/DR-2-amendment); EXTEND for the full DR-2 panel + the force-relay PC recreation. Read how addPeer creates RTCPeerConnection (now via fetched ice-config) — force-relay adds `iceTransportPolicy:'relay'`.
- `frontend/src/app/services/ws.service.ts` — current reconnect state (DR-3). diagb1 may have touched resync; build on it.
- `frontend/src/app/pages/room/room.page.{ts,html,scss}` — diagnostics panel UI + force-relay toggle + `__meetDebug` hooks.
- `frontend/src/app/services/media.service.ts` — getDisplayMedia error path (DR-1).
- `frontend/src/app/services/ice-config.service.ts` — force-relay needs to pass iceTransportPolicy into PC creation.

## Scope

- Implement DR-1, DR-2, DR-3 ONLY.
- Do NOT touch DR-4/5/6/7/9/10 (done) or the TURN credentials.
- Force-relay toggle must NOT change default behavior (default OFF = current ICE config incl. TURN as fallback).
- Surgical.

## Plan handshake (MANDATORY)

STATUS: PROPOSED with: how DR-2 extends the existing peer-state tracking; how the force-relay toggle recreates PCs with iceTransportPolicy:'relay' (and whether it re-joins or hot-swaps); current WS reconnect state + DR-3 plan incl. the new-clientId/stale-peer cleanup; DR-1 error-surface plan; planned files; risks. Append callback. Wait for APPROVED-PLAN.

## Tests

- DR-1: stub getDisplayMedia → NotAllowedError → assert helper panel + macOS grant + Cmd+Q restart text.
- DR-2: 2-peer fake-device harness → assert diagnostics panel lists peers with connectionState/iceConnectionState fields; assert force-relay toggle exists + flips a debug flag (window.__meetDebug) + persists across reload. (Can't truly exercise relay in same-process fake-device, but assert the PC is recreated with iceTransportPolicy:'relay' via a debug hook.)
- DR-3: simulate WS close → assert reconnect (backoff) + re-sync (peer list re-requested) + stale peers cleared.

## Required artifacts at plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/batch-diagb2/

changes.md, scenarios.md, review.md, test-report.md, screenshots/{screen-share-helper.png, diagnostics-panel.png}, independent-validation.md, decisions/<date>-*.md (or "none").

## Build + deploy

- Backend + frontend build PASS; backend tests PASS; new e2e PASS; full Run-1 + diag1 + diagb1 + diagb2 regression PASS — R8.1 must hold.
- pm2 restart meet-poc-fe meet-poc-be.
- Live smoke: diagnostics panel renders + lists peers; force-relay toggle present + persists; screen-share-denied path shows helper.

## Completion

COMMIT BEFORE STATUS: DONE. End with `STATUS: DONE — <reason>` + append `[projcore callback] diagb2 DONE <note>` to callbacks.md.
