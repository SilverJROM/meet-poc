Batch-DIAGLOG: Persistent per-call connection-diagnostics log (DR-28)

Batch ID: diaglog
Requirement: DR-28 (full text in plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/og-requirements.md)
Branch: continue on fix/meet-conn-diag.

**Protocol: projcore v2.0.** Plan handshake first (PROPOSED → APPROVED-PLAN → code). Append `[projcore callback] diaglog <STATE> <note>` to the run callbacks.md as the final action of each STATUS reply. End with `STATUS: <verb> — <reason>`.
**ENV-HYGIENE:** never leak MEET_DB_PATH/MEET_RECORDINGS_DIR onto the live pm2 service; clean ecosystem restart; verify no /tmp leak.

## DR-28 — persistent per-call diagnostics log (separate viewable section)

JROM: "log all the diagnostics on all calls and list them as a separate section so that we can use it to troubleshoot just in case this happens again." This is the troubleshooting tool that will reveal the US-connection root cause (and the external-mic issue, DR-29) on the next real call.

For EVERY call/session, capture per-peer connection diagnostics over time and persist them (backend, keyed by session/room), exposed in a separate viewable section:
- Per remote peer: selected candidate type (host/srflx/**relay**), connectionState / iceConnectionState / iceGatheringState / signalingState transitions, quality (packet loss / jitter / RTT / bitrate), relay-used flag, reconnect/grace events, errors.
- **CRITICAL ADD (for DR-29 + US bug):** also log, per peer (local + remote where available), the ACTIVE published track info — the OUTBOUND audio sender track's deviceId + label + enabled/muted + readyState, and the video sender track's deviceId + label. This is what tells us whether an EXTERNAL mic selected in the lobby is actually the track being published in-call (the suspected root of "his mic works in device-check but I can't hear him").
- Persist per session (a JSON log alongside the session, or a diagnostics table). NOT ephemeral — survives the call so JROM can review later.
- A separate viewable section/page (e.g., `/app/diagnostics` or per-session diagnostics view) listing past calls + their per-peer logs. Downloadable is a plus.

## Observed (confirm by reading)

- `frontend/src/app/services/webrtc.service.ts` — existing DR-2 diagnostics (states + getStats candidate type) + DR-11 quality polling. EXTEND to also read the sender track deviceId/label + emit a diagnostics stream/event.
- `frontend/src/app/services/media.service.ts` — local stream/track device info (the active mic/camera deviceId+label).
- `backend/src/modules/sessions/*` + `recording/*` — where session metadata lives; add a diagnostics persistence path (per session). Reuse the FIX-B2 sidecar pattern or a sessions-diagnostics store.
- `frontend/src/app/pages/*` — add the diagnostics-list view (a new page or a section in an existing admin/recordings/sessions view).
- The room page should POST/stream the collected diagnostics to the backend periodically + at call end.

## Scope

- DR-28 only. Persistent diagnostics logging + viewable section + active-track deviceId/label capture.
- Do NOT regress DR-1..27 or the live diagnostics PANEL (DR-2) — this ADDS persistence + the active-track info.
- Privacy: diagnostics are per-owner (don't leak across users); auth-gated.

## Plan handshake (MANDATORY)

STATUS: PROPOSED with: what you capture per peer (incl. the active audio/video sender track deviceId+label — emphasize this), how/where you persist (per-session store/file), the viewable section (page/route), how the room page ships diagnostics to the backend (periodic + on call-end), privacy/auth, planned files. Append callback. Wait for APPROVED-PLAN.

## Tests

- Backend: a session's diagnostics persist + are retrievable per session (auth + owner-gated).
- Playwright (2 fake-device peers): a call produces a diagnostics log entry; the diagnostics section lists it with per-peer states + candidate types + the active audio/video track deviceId/label fields present.
- Use config baseURL / E2E_BASE_URL — NO hardcoded :4710.

## Required artifacts at plan/.../batch-diaglog/

changes.md, scenarios.md, review.md, test-report.md, screenshots/diagnostics-log-view.png, independent-validation.md, decisions/<date>-*.md (or "none").

## Build + deploy

Backend+frontend build PASS; tests PASS; new e2e PASS; gate PASS on clean DB; pm2 restart clean (verify no leak); clean up test rooms.

## Completion

COMMIT BEFORE STATUS: DONE + append the diaglog DONE callback. After this lands + JROM does a real US call, the log will reveal whether relay was used + whether the external mic's track is published — pinning the US + DR-29 fixes.
