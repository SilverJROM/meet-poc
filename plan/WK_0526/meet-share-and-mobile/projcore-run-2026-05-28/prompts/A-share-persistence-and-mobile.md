# Batch A — Persistent share-approval + Mobile fallback + Host revoke (R14, R15, R16)

> **Role for THIS dispatch:** You are the IMPLEMENTER. You are NOT projcore. Claude /projcore is supervising from session `lkvc-38` and watching this session (`lkvc-38-codex`) for your STATUS callback. Do NOT invoke the `$projcore` skill, do NOT spawn additional sessions, do NOT modify queue.md / progress.md / req-matrix.md / context-handoff.md / north-star.md / og-requirements.md. Just implement the scope below in THIS session and emit `STATUS: DONE — Batch A ready for validation` when finished.

Three related share-flow improvements in ONE commit.

## R14 — Persistent share-approval per call

### Backend
File: `backend/src/modules/signaling/index.ts`

The `LiveRoom` type already exists. Add a new field:
```ts
shareGrants: Set<string>;  // clientIds that have an active per-call share grant
```

Initialize as `new Set()` in `getOrCreateLiveRoom`.

In the `share-decision` handler (around line 993), when `approved === true`:
- After sending the existing `share-decision` to the requester
- Also: `live.shareGrants.add(requesterClientId)`

In the `share-request` handler (around line 972), BEFORE broadcasting `share-request-incoming` to hosts:
- If `live.shareGrants.has(clientId)`: immediately send `share-decision approved=true` back to requester. DO NOT notify hosts. Return early.

In peer-leave / disconnect / `removeFromRoster` paths: drop the clientId from `shareGrants` so a rejoin needs fresh approval.

In `closeRoomForHost` (clears all state): clear `shareGrants`.

### Frontend
File: `frontend/src/app/pages/room/room.page.ts`

`requestShareApproval()` / wherever the share-request is sent: no change needed — backend handles the fast-path silently. The `share-decision approved=true` response triggers the existing publishScreen flow.

## R15 — Mobile graceful fallback

File: `frontend/src/app/services/media.service.ts`

Modify `toggleScreen()` (line 272-290): before the `getDisplayMedia` call (line 278), feature-detect:

```ts
async toggleScreen(onVideoTrackChanged: (track: MediaStreamTrack | null) => Promise<void>): Promise<boolean> {
  if (this.screenTrack) {
    await this.stopScreen(onVideoTrackChanged);
    return false;
  }
  if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function') {
    throw new ScreenShareUnsupportedError("Screen sharing isn't available in this browser. Try Chrome on Android, Safari 16+ on iPhone, or join from a desktop.");
  }
  this.screenShareAttempts.update((count) => count + 1);
  // ... existing code
}
```

Add the typed error class at the top of the file (or import from a shared types file):
```ts
export class ScreenShareUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScreenShareUnsupportedError';
  }
}
```

File: `frontend/src/app/pages/room/room.page.ts`

`toggleScreen()` (around line 685): wrap the `media.toggleScreen` call in try/catch. If caught error `instanceof ScreenShareUnsupportedError`: set `actionNotice(err.message)`. Don't propagate.

## R16 — Host revoke

### Backend
File: `backend/src/modules/signaling/index.ts`

Add new incoming WS message:
- `{type: 'share-revoke', clientId: string}` — host action.

Handler (gate with `isHostCommandAllowed`):
- Remove `clientId` from `live.shareGrants`
- Send `{type: 'share-revoked'}` to the target peer (acknowledgement). NOT a broadcast — direct DM.

### Frontend
File: `frontend/src/app/services/ws.service.ts`

Add to incoming/outgoing type unions: `share-revoke`, `share-revoked`.

File: `frontend/src/app/pages/room/room.page.ts`

- New signal: `peersWithShareGrant = signal<Set<string>>(new Set())`.
- On `share-decision approved=true` (RECEIVED on host side via the existing broadcast path OR on initial approval): add the requester to the set.
  - Actually the cleaner way: when host calls `approveShareRequest(clientId)`, push clientId into `peersWithShareGrant` locally too. Mirror the backend state on host's side.
- On `share-revoked` (received on target peer side): `actionNotice('Host revoked your screen-share permission. Your current share continues; next time you'll need to ask again.')`.
- New method: `revokeShareGrant(clientId)` → send WS `{type: 'share-revoke', clientId}` AND remove from local `peersWithShareGrant`.

File: `frontend/src/app/components/participant-sidebar/participant-sidebar.component.{html,ts}`

In the host view of admitted peers, IF `peersWithShareGrant().has(peer.id)`: show a small "Revoke share permission" action (alongside mute/remove kebab menu items, or a small chip below name). Click → emit `revokeShare(peer.id)`. Wire from `room.page.html` to call `revokeShareGrant`.

Use the existing `canManage(peer)` gate (host-only).

Pass the new signal as an input: `[shareGrantClientIds]="peersWithShareGrant()"`.

## R17 — Tests + builds

New specs in `e2e/tests/fixloop-banner/`:

- `share-persistent.spec.ts`: host admits guest; guest requests share, host approves; guest stops share; guest re-clicks share → assert NO new share-request-incoming toast appears on host (the second share happens directly).
- `share-revoke.spec.ts`: same setup. After host approves once, host clicks revoke on the peer. Guest sees notice. Guest clicks share again → host SEES the approval toast again.
- `share-mobile-fallback.spec.ts`: use Playwright's `page.addInitScript` to delete `navigator.mediaDevices.getDisplayMedia` before page load. Host joins, clicks Share → assert `actionNotice` shows the "use desktop" message.

## Hard constraints
- ONLY touch the files listed above. No sweeping refactors.
- DO NOT modify projcore-owned artifacts (north-star, queue, req-matrix, progress, context-handoff, callbacks).
- Backend `shareGrants` is purely in-memory (LiveRoom state). NO database persistence — per north-star D1.
- The mobile fallback MUST surface a user-facing message — silent throw is the bug we're fixing.

## Acceptance gate
1. `cd backend && npm run build` — 0 errors.
2. `cd frontend && ng build` — 0 errors.
3. `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` — ALL existing (13) + 3 new specs PASS.
4. Write `validation/A-share-persistence-and-mobile.md`.
5. Commit (one): `feat(share): persistent per-call approval + mobile fallback + host revoke`.

Final line MUST be EXACTLY: `STATUS: DONE — Batch A ready for validation`.
