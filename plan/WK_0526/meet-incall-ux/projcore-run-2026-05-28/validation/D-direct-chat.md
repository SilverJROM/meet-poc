# Batch D Validation — Direct Chat

## Scope
- Backend WS signaling supports ephemeral `chat-direct` messages routed only to an admitted recipient.
- Frontend chat uses per-recipient threads with an `everyone` broadcast tab and one tab per peer/direct thread.
- Direct messages are optimistic locally for the sender and are not persisted server-side.

## Commands
- `cd backend && npm run build` — PASS
- `cd frontend && ng build` — PASS
- `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` — PASS, 13/13

## New Coverage
- `e2e/tests/fixloop-banner/chat-direct.spec.ts`
- Scenario: 3 admitted peers; host sends a DM to DirectB; DirectB receives it in the host tab; DirectC does not receive the message.

## Notes
- `chat-direct` delivery is WebSocket signaling only and does not go through SFU.
- If the recipient is not admitted at delivery time, the backend drops the message.
