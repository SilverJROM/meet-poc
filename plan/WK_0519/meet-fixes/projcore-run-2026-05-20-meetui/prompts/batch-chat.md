Batch-CHAT: Ephemeral in-call chat (DR-27)

Batch ID: chat
Requirement: DR-27 (full text in plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/og-requirements.md)
Branch: continue on fix/meet-conn-diag.

**Protocol: projcore v2.0.** Plan handshake first (PROPOSED → APPROVED-PLAN → code). Append `[projcore callback] chat <STATE> <note>` to the run callbacks.md as the final action of each STATUS reply. End with `STATUS: <verb> — <reason>`.
**ENV-HYGIENE:** never leak MEET_DB_PATH/MEET_RECORDINGS_DIR onto the live pm2 service; clean ecosystem restart; verify no /tmp leak.

## DR-27 — Ephemeral in-call chat

Real-time text chat over the EXISTING WebSocket signaling, visible to all ADMITTED participants.
- The DR-26 chat icon (currently a disabled placeholder in the controls-bar bottom-right) becomes functional — toggles a side chat panel (Meet-like).
- Panel shows messages as `sender name: text` with a timestamp, newest at bottom, auto-scroll.
- Compose box + send (Enter to send).
- **Ephemeral:** messages relayed in-memory over the WS to admitted peers; NOT persisted to any DB/file. Cleared when the call ends / on leave.
- **Unread badge** on the chat icon when the panel is closed + a new message arrives; clears when opened.
- Text-only (no files/links handling beyond plain text rendering; escape/sanitize to prevent XSS — render as text, never innerHTML).
- Only admitted participants send/receive (gate like other signaling).

## Observed (confirm by reading)

- `backend/src/modules/signaling/index.ts` — add a `chat` message type relayed to admitted peers (like media-state relay); do NOT persist. Gate to admitted only.
- `frontend/src/app/services/ws.service.ts` — send/receive the chat message.
- `frontend/src/app/pages/room/room.page.{ts,html,scss}` — chat panel state, messages signal, unread count, send handler; wire the controls-bar chat icon (remove its `disabled` placeholder, add an output/handler).
- `frontend/src/app/components/controls-bar/controls-bar.component.{ts,html}` — the chat icon: change from disabled placeholder to an active button emitting a `chat` output (mirror the diagnostics/sidebar toggle pattern).
- New chat panel component or inline in room.page (your call — propose).

## Scope

- DR-27 only. Ephemeral chat. Do NOT persist messages anywhere.
- Do NOT regress DR-1..26 (esp. the MUI restyle controls + the diagnostics/sidebar panels — chat is another toggle-able side panel).
- Sanitize message text (render as textContent, never raw HTML) — security.

## Plan handshake (MANDATORY)

STATUS: PROPOSED with: the WS chat message shape + admitted-only relay (no persistence), the panel UI (component vs inline), unread-badge logic, how you wire the placeholder chat icon to active, XSS-safe rendering, planned files. Append callback. Wait for APPROVED-PLAN.

## Tests

- Backend: chat message relayed to admitted peers only; NOT persisted (no DB/file write); non-admitted can't inject.
- Playwright (2 peers): peer A sends a chat message → peer B's panel shows it (sender + text); unread badge increments on B when B's panel closed, clears on open; messages gone after the call ends (rejoin shows empty); a message containing HTML/script renders as TEXT (not executed).

## Required artifacts at plan/.../batch-chat/

changes.md, scenarios.md, review.md, test-report.md, screenshots/{chat-panel.png, chat-unread-badge.png}, independent-validation.md, decisions/<date>-*.md (or "none").

## Build + deploy

Backend+frontend build PASS; tests PASS; new e2e PASS; gate PASS on clean DB; pm2 restart clean (verify no leak); clean up test rooms.
Note: if you write e2e that opens a room URL directly, use the playwright config baseURL or E2E_BASE_URL — do NOT hardcode :4710 (recurring test-config bug; the live FE is :4700).

## Completion

COMMIT BEFORE STATUS: DONE + append the chat DONE callback.
