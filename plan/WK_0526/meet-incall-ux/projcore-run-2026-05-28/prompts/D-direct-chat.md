# Batch D — Direct chat with per-recipient tabs

> **Role for THIS dispatch:** You are the IMPLEMENTER. You are NOT projcore. Claude /projcore is supervising from session `lkvc-38-audio-fix` and watching this session (`lkvc-38-audio-fix-codex`) for your STATUS callback. Do NOT invoke the `$projcore` skill, do NOT spawn additional sessions, do NOT modify queue.md / progress.md / req-matrix.md / context-handoff.md — those are projcore's. Just implement the scope below in THIS session and emit `STATUS: DONE — Batch D ready for validation` when finished.

## Scope

### Backend
File: `backend/src/modules/signaling/index.ts`

Current `chat` WS message broadcasts to all admitted peers. Add new message type `chat-direct`:

Incoming from sender:
- `{type: 'chat-direct', toClientId: string, text: string, clientMessageId?: string}`

Backend handler:
- Look up `toClientId` in `live.admitted`. If not found, ignore (don't echo back).
- Send to target only:
  - `{type: 'chat-direct', id, clientId: sender, sender: senderName, toClientId, text, sentAt}`
- Also echo back to sender so they see their own DM in their own chat tab:
  - `{type: 'chat-direct', id, clientId: sender, sender: senderName, toClientId, text, sentAt, mine: true}` — but careful: this is the SAME message; sender's frontend already added it locally. Just don't double-deliver. Trust sender's local optimistic-add.

Alternative simpler approach: server only delivers to recipient. Sender's own UI already adds the message locally when they send. No echo needed.

### Frontend

File: `frontend/src/app/services/ws.service.ts` — add `chat-direct` to incoming + outgoing unions.

File: `frontend/src/app/pages/room/room.page.ts`

Refactor chat model. Current:
```ts
readonly chatMessages = signal<ChatMessage[]>([]);
```

New: keyed by recipient (either "everyone" or a peer clientId):
```ts
readonly chatThreads = signal<Map<string, ChatMessage[]>>(new Map([['everyone', []]]));
readonly activeChatRecipient = signal<string>('everyone');  // 'everyone' or peer clientId
```

Methods:
- `setActiveChatRecipient(id: string)` — switch tab. Mark unread = 0 for that thread.
- `sendChat()` — if `activeChatRecipient === 'everyone'`, send broadcast `chat` (existing). Else send `chat-direct` with `toClientId: activeChatRecipient`. In both cases, append to the appropriate thread immediately (optimistic local add).
- Handle incoming `chat`: append to `everyone` thread.
- Handle incoming `chat-direct`: append to thread keyed by sender's clientId. Track unread per thread.

`chatUnreadCount` becomes per-thread. Visible per-tab.

File: `frontend/src/app/pages/room/room.page.html`

Chat panel template change. Above the messages list, add a tab bar:
```html
<div class="chat-tabs" role="tablist">
  <button role="tab" [class.active]="activeChatRecipient() === 'everyone'" (click)="setActiveChatRecipient('everyone')">Everyone</button>
  @for (peer of peers(); track peer.id) {
    @if (!peer.isLocal) {
      <button role="tab" [class.active]="activeChatRecipient() === peer.id" (click)="setActiveChatRecipient(peer.id)">
        @{{ peer.name }}
        @if (unreadFor(peer.id) > 0) {
          <span class="unread-badge">{{ unreadFor(peer.id) }}</span>
        }
      </button>
    }
  }
</div>
```

Message rendering uses `chatThreads().get(activeChatRecipient()) ?? []`.

### UX details
- New tab added automatically when receiving a DM from a previously-not-in-thread peer.
- Tab closes when the peer leaves (drop the thread? Or archive? Recommend: keep thread but disable typing if peer offline).
- Empty state per thread: "No messages with @<name> yet" or "No messages yet — say hi to everyone".

### Edge cases
- Self-DM: never allow (`activeChatRecipient !== myId`).
- Long peer names: truncate with ellipsis in tab.
- Tabs overflow: horizontal scroll within `.chat-tabs` if many peers.

## Hard constraints
- ONE commit.
- Don't change the existing broadcast `chat` semantics — backward compatible.
- DM messages are NOT persisted server-side (just like broadcast chat today). If recipient is offline at delivery time, message is lost. Document this in commit message.
- DM does NOT go through SFU — it's purely WS signaling.

## Acceptance gate
1. `cd backend && npm run build` — 0 errors.
2. `cd frontend && ng build` — 0 errors.
3. `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` — ALL PASS.
4. New playwright spec: `chat-direct.spec.ts` — 3 peers; A sends DM to B; B receives, C does NOT.
5. Write `validation/D-direct-chat.md`.
6. Commit: `feat(room): direct (1:1) chat with per-recipient tabs`.

Final line MUST be: `STATUS: DONE — Batch D ready for validation`.
