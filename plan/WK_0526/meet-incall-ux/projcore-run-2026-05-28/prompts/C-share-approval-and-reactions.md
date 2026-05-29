# Batch C — Screen-share approval + Reactions (raise hand, thumbs up)

> **Role for THIS dispatch:** You are the IMPLEMENTER. You are NOT projcore. Claude /projcore is supervising from session `lkvc-38-audio-fix` and watching this session (`lkvc-38-audio-fix-codex`) for your STATUS callback. Do NOT invoke the `$projcore` skill, do NOT spawn additional sessions, do NOT modify queue.md / progress.md / req-matrix.md / context-handoff.md — those are projcore's. Just implement the scope below in THIS session and emit `STATUS: DONE — Batch C ready for validation` when finished.

Two related but separate features sharing the same WS protocol surface. ONE commit.

## C1 — Screen-share approval

### Behavior
- Host's share: no approval needed (host clicks share → immediate publish, same as today).
- Non-host's share: clicking share triggers a request to host. Host gets an Allow/Deny prompt (small modal or toast). On Allow, guest proceeds with `getDisplayMedia` + publish. On Deny, guest sees inline error.
- One pending share-request at a time per host. If a new request arrives while one is pending, queue or reject (implementer choice — recommend reject with "host is reviewing another request").

### Backend additions
File: `backend/src/modules/signaling/index.ts`

New incoming WS message types from guest:
- `{type: 'share-request'}` — guest asks host for permission.

New outgoing WS messages:
- `{type: 'share-request-incoming', clientId, name}` — broadcast to host(s) only.
- `{type: 'share-decision', approved: boolean, reason?: string}` — host responds; backend routes to the original requester.

Handler logic:
- On `share-request`: find host(s) in the room (admitted peers where `isOwnerOf` is true), broadcast `share-request-incoming` to them, remember the pending request by clientId.
- On `share-decision` from host: look up the pending request, send `share-decision` to the requester, clear the pending request.

### Frontend additions
File: `frontend/src/app/services/ws.service.ts` — add new message types to the union.

File: `frontend/src/app/pages/room/room.page.ts`
- New signal `pendingShareRequests = signal<Array<{clientId: string; name: string}>>([])` for host UI.
- New signal `myShareRequestPending = signal(false)` for guest UI.
- Modify `toggleScreen()`: if `!this.isHost() && !sfu has a screen track`, send `share-request` and set `myShareRequestPending = true`. Don't proceed with getDisplayMedia yet.
- Handler for `share-request-incoming`: push to `pendingShareRequests`. Render as a small approval toast (similar styling to knock-toast).
- Handler for `share-decision`: if `approved`, NOW call the actual screen-capture + publish logic. If not, set `actionNotice('Host denied screen share')`.
- New methods: `approveShare(clientId)` / `denyShare(clientId)` — send `share-decision` and remove from pending list.

### UI
- Host: a small toast near the knock-toast-stack area: "`<name>` wants to share screen — [Allow] [Deny]". Persists until host decides or the requester cancels (e.g., disconnects).
- Guest: small "Requesting permission to share..." status while pending.

## C2 — Reactions (raise hand + thumbs up)

### Reactions supported (Phase 1)
- `raise-hand` — persistent state until lowered
- `thumbs-up` — transient (auto-clears after 3s)
- `clap` — transient
- `heart` — transient

(Easy to add more later.)

### Backend
File: `backend/src/modules/signaling/index.ts`

New incoming WS:
- `{type: 'reaction', kind: 'raise-hand' | 'thumbs-up' | 'clap' | 'heart', state?: 'on' | 'off'}` — for raise-hand, `state: 'on'|'off'`. For others, no state (always transient).

Backend broadcasts:
- `{type: 'reaction', clientId, kind, state?}` — to all admitted peers (NOT the sender).

### Frontend
File: `frontend/src/app/services/ws.service.ts` — add to union.

File: `frontend/src/app/pages/room/room.page.ts`
- New `raisedHands = signal<Set<string>>(new Set())` — peer clientIds currently raising hand.
- New `transientReactions = signal<Array<{id: string; clientId: string; kind: string; timestamp: number}>>([])` — for floating animations.
- Handler: on incoming `reaction`, update appropriate signal. For transient reactions, push and schedule a `setTimeout(3000)` to remove.
- New methods: `sendReaction(kind)`, `toggleRaiseHand()` — send WS message + update local state.

### UI
- New small reactions button in controls-bar: emoji icon → popover with options (✋ Raise hand, 👍, 👏, ❤️).
- Local + remote peers with raised hands: small ✋ badge on their tile (top-left, persistent until lowered).
- Transient reactions: floating emoji that animates up-and-fade from a peer's tile center. Position absolute, 3s animation.

### Tile component additions
File: `frontend/src/app/components/tile/tile.component.{ts,html,scss}`

Add `raisedHand` input (boolean) and render a badge if true. Floating reactions can be a separate component overlay OR a CSS class on the tile triggered by a transient signal.

## Hard constraints
- ONE commit covering C1 + C2.
- Backend signaling: add new message types without touching existing ones.
- Frontend: do not modify chat, knock-toast, or any audio/video flows.
- Reactions are PURE UI signals — no media, no SFU touch.

## Acceptance gate
1. `cd backend && npm run build` — 0 errors.
2. `cd frontend && ng build` — 0 errors.
3. `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` — ALL PASS.
4. New playwright spec: `share-approval.spec.ts` — guest requests share, host approves, guest publishes; guest requests, host denies, guest sees notice.
5. New playwright spec: `reactions.spec.ts` — peer raises hand, others see badge; peer sends thumbs-up, others see transient animation appear and disappear.
6. Write `validation/C-share-and-reactions.md`.
7. Commit: `feat(room): screen-share approval flow + reactions (raise hand, thumbs up)`.

**Final line MUST be EXACTLY**: `STATUS: DONE — Batch C ready for validation`. (Bg grep watches for `─ Worked for` to avoid false positives on brief-text reads.)
