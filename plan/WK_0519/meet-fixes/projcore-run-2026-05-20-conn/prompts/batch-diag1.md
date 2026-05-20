Batch-DIAG1: Connection-reliability 80/20 fix (TURN plumbing + ICE-restart + screen-share helper + diagnostics + WS-reconnect)

Batch ID: diag1
Plan/requirements: plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/og-requirements.md (READ IN FULL — DR-1..DR-5)
Branch: fix/meet-conn-diag (off fix/meet-fixc8-transcriber-config tip)
Requirements assigned: DR-1, DR-2, DR-3, DR-4, DR-5

**Protocol: projcore v2.0.**
1. **Plan handshake BEFORE code** — reply STATUS: PROPOSED first; wait for projcore APPROVED-PLAN before implementing.
2. **Callback discipline** — as the FINAL action of every STATUS-change reply, append one line to `plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/callbacks.md`:
   `[projcore callback] diag1 <STATE> <one-line note>`
   End every reply with a dedicated line `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>`.

## Why this batch exists

JROM tested Run-C on a real desktop (Chrome/macOS). Fake-device test calls work, but real remote peers on the SAME WiFi show **"failed" + frozen video**. Root-cause analysis: app is **full-mesh P2P with STUN only (no TURN)** — same-LAN failure is the classic **WiFi client-isolation** signature (P2P literally can't connect; needs a relay). JROM evaluated options and chose the **80/20 fix**: TURN relay (managed) + ICE-restart auto-recovery, plus the screen-share helper + cheap diagnostics/WS-reconnect.

**This batch builds everything that doesn't need TURN credentials.** JROM is provisioning managed-TURN creds in parallel (Metered static OR Cloudflare minted — TBD). DR-5 makes the ICE config credential-driven so creds drop in via env with ZERO further code change. Repo stays STUN-only by default — NEVER hardcode credentials.

## Requirements — full text in og-requirements.md (DR-1..DR-5). Summary:

- **DR-1 Screen-share helper** — friendly in-app panel on getDisplayMedia failure: enable macOS Screen Recording for Chrome + fully quit/reopen Chrome (Cmd+Q). Can't remove the OS dialog; guide the user.
- **DR-2 Per-peer diagnostics** — connectionState/iceConnectionState/iceGatheringState/signalingState + selected candidate type (host/srflx/**relay**) via getStats; visible diagnostics panel; state-change logging. (Lets JROM confirm relay is used once TURN is live.)
- **DR-3 WS auto-reconnect** — verify + harden: exponential backoff reconnect + re-sync (re-announce presence, re-request peer list); log transitions.
- **DR-4 ICE-restart auto-recovery** — on iceConnectionState/connectionState → disconnected/failed per peer, fire `pc.restartIce()` + renegotiate (offer/answer over signaling); debounce + cap retries.
- **DR-5 TURN config plumbing** — frontend fetches ICE servers from backend `GET /api/ice-config` instead of hardcoded `environment.iceServers`. Backend returns STUN + (if env set) TURN. **Support BOTH credential shapes:** static long-term (Metered: urls/username/credential) AND minted short-lived (Cloudflare: backend mints via API key). Default off → STUN-only, no regression.

## Observed (confirm by reading)

- `frontend/src/environments/environment.ts` — STUN-only iceServers (the thing DR-5 replaces with a fetched config).
- `frontend/src/app/services/webrtc.service.ts` — `new RTCPeerConnection({ iceServers: environment.iceServers })`. Add state listeners (DR-2), restartIce (DR-4), and consume the fetched config (DR-5). Read how offers/answers + renegotiation flow today (needed for DR-4).
- `frontend/src/app/services/ws.service.ts` — check existing reconnect logic (DR-3).
- `frontend/src/app/pages/room/room.page.ts` — has `__meetDebug` + `peerConnectionStates()`; extend for the diagnostics panel.
- `frontend/src/app/services/media.service.ts` — getDisplayMedia/startScreenShare path (DR-1).
- backend signaling module — for the renegotiation messages (DR-4) + the new `/api/ice-config` route (DR-5).

## Expected (acceptance criteria) — see og-requirements.md for the full per-DR list. Key:

- DR-1: getDisplayMedia rejection → styled helper panel with macOS grant + Cmd+Q-restart steps. No dead buttons (browsers can't open System Settings — written steps OK).
- DR-2: every peer's 4 states tracked live + candidate type via getStats; diagnostics panel (toggle is fine); transitions console-logged with peer id + timestamp.
- DR-3: WS drop → backoff reconnect → re-sync presence + peer list.
- DR-4: forced ice failure → restartIce() + new negotiation round; debounced; retry cap.
- DR-5: `/api/ice-config` returns STUN-only when TURN env unset (no regression); returns TURN when set; both static + minted credential shapes supported via env config.

## Scope (hard limits)

- Implement DR-1..DR-5 ONLY.
- NEVER hardcode TURN credentials — env/secrets only; repo default = STUN-only.
- NO self-hosted coturn (managed TURN chosen).
- NO SFU/media-server rebuild (long-term, out of scope).
- Do NOT touch FIXC1-8 (VERIFIED).
- If DR-1..DR-5 is too large for one clean batch, propose a 2-batch split in PROPOSED (suggested cut: batch A = DR-5 ICE-config + DR-4 ICE-restart [the reliability core]; batch B = DR-1 helper + DR-2 diagnostics + DR-3 WS-reconnect). Projcore decides at handshake.

## Plan handshake (MANDATORY before code)

1. Read this brief + og-requirements.md + the referenced files.
2. STATUS: PROPOSED with: mechanism-level read of peer-state + renegotiation + WS handling today; per-DR plan; whether WS already reconnects; how you'll structure `/api/ice-config` for both credential shapes; the renegotiation mechanism for DR-4 restartIce; planned files; risks; and a recommended 1-batch vs 2-batch split.
3. Append callback line. Wait for APPROVED-PLAN.
4. After approval: implement, COMMIT BEFORE STATUS: DONE.

## Tests

- DR-1: stub getDisplayMedia → NotAllowedError → assert helper panel + restart-Chrome text.
- DR-2: 2-peer fake-device harness (reuse FIXC3/FIXB2) → assert diagnostics panel lists peer states.
- DR-3: simulate WS close → assert reconnect + re-sync.
- DR-4: force ice failure on a pc → assert restartIce() called + renegotiation occurs.
- DR-5: backend test — `/api/ice-config` STUN-only when env unset, TURN entries when env set (both shapes). Frontend uses fetched config.

## Required artifacts at plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/batch-diag1/

changes.md, scenarios.md, review.md, test-report.md, screenshots/{screen-share-helper.png, diagnostics-panel.png}, independent-validation.md, decisions/<date>-*.md per §1.15 (or "none").

## Build + deploy

- Backend + frontend build PASS; backend tests PASS; new e2e PASS; Run 1 regression (67-spec set + new specs) PASS — R8.1 must hold.
- pm2 restart meet-poc-fe meet-poc-be.
- Live smoke: diagnostics panel renders; screen-share-denied path shows helper; `/api/ice-config` returns STUN-only (no creds yet).

## Completion

End every reply with `STATUS: <verb> — <reason>` AND append `[projcore callback] diag1 <STATE> <note>` to callbacks.md as the final action.
