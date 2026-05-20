# Batch Chat Changes

## User Report
> "3rd add a chat functionality on the window."

Locked requirement: DR-27 ephemeral in-call chat over the existing WebSocket, admitted participants only, no persistence, unread badge, text-only, XSS-safe.

## Root Cause / Mechanism
DR-26 intentionally left the Meet-like chat icon as an inert placeholder. The app already had admitted-peer WebSocket signaling for media state and WebRTC payloads, but no chat message type, room-page chat state, unread badge, or chat panel UI.

## Code Changes
- `backend/src/modules/signaling/index.ts`
  - Added a `chat` message branch gated to `state === 'admitted'`.
  - Backend trims text, caps messages at 2000 characters, ignores empty/whitespace-only messages, generates `id` and `sentAt`, and uses server-known `clientId`/`myName`.
  - Relays to current admitted peers only. No DB/file write and no replay state.
- `frontend/src/app/services/ws.service.ts`
  - Added typed incoming and outgoing chat signaling messages.
- `frontend/src/app/components/controls-bar/controls-bar.component.{ts,html,scss}`
  - Replaced the disabled DR-26 chat placeholder with an active chat toggle.
  - Added chat open state and unread badge input while keeping existing controls wired.
- `frontend/src/app/pages/room/room.page.{ts,html,scss}`
  - Added inline right-side in-call chat panel, message list, composer, send-on-Enter, unread tracking, and cleanup-on-call-leave.
  - Opening chat clears unread; opening participants closes chat to keep one side drawer active.
  - Messages render through Angular interpolation only.
- `backend/tests/signaling-chat.test.ts`
  - Covers admitted-only relay, server-owned identity, text cap/trim, empty-message ignore, pending-sender ignore, and no replay after rejoin.
- `e2e/tests/v3-chat/chat.spec.ts`
  - Covers two-peer UI chat, unread badge, screenshot evidence, XSS-safe text rendering, and empty panel after call end/rejoin.
- `e2e/tests/v3-mui-meet-ui/meet-ui.spec.ts`
  - Updated the DR-26 expectation from inert chat placeholder to the now-functional chat toggle.

## Security Notes
- No client-supplied sender/client identity is trusted.
- Chat content is rendered as text, never via `innerHTML`.
- Message length is capped at 2000 characters.

## Persistence Notes
- No schema, database, recording, transcript, file, or sidecar persistence was added.
- Messages exist only in live browser state and transient WS relay payloads.

