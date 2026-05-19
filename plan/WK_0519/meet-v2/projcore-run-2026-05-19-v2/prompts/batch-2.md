# Batch v2-B2 — Backend: host authority + recording binding

**Persona switch:** Invoke `$lead`. You are NOT `$projcore`. Claude `/projcore` supervises.

**Batch ID:** v2-B2
**Plan:** `/home/agjrom/websites/meet-poc/plan/WK_0519/meet-v2/implementation-plan.md`
**Branch:** `feat/meet-v2-b2-host-authority` — off the B1 HEAD.

**Requirements assigned (verbatim from og-requirements.md):**
- **R2.1** — `/upload` cookie-trust (401 if no session, 403 if non-owner)
- **R2.2** — `/upload` 409 if no open `meeting_session` for (roomId, hostEmail)
- **R2.3** — Recording filename embeds `meeting_session_id`; backward-compat parser
- **R2.4** — WS broadcasts: `recording-started/stopped`, `meeting-ended`, `mute-request`, `peer-removed`
- **R2.5** — Host-only WS commands (server validates): `meeting-ended-by-host`, `mute-target`, `remove-peer`, `recording-state`
- **R2.6** — Non-host commands dropped silently with info-level log
- **R2.7** — Helper `getHostClientId(roomId)` (already exported in B1; B2 first user)

Read in full before coding:
- `/home/agjrom/websites/meet-poc/plan/WK_0519/meet-v2/og-requirements.md` (R2 section)
- `/home/agjrom/websites/meet-poc/plan/WK_0519/meet-v2/scenarios.md` (S2.1-S2.9)
- `/home/agjrom/websites/meet-poc/plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/context-handoff.md` (post-B1 state + B2 wire-format additions)
- Existing modules: `backend/src/modules/{recording,signaling,sessions,auth}/`

---

## Expected (acceptance criteria)

### Step 1 — `/upload` auth + session binding

Modify `backend/src/modules/recording/index.ts`:

- Wrap `/upload` handler with `requireAuth` (mount under auth middleware OR add the cookie-parse + user lookup inline matching the rest of the codebase).
- After auth, read `X-Room` header (existing). Look up `getRoom(roomId, db)`. If room not found → 404 `{error:'room not found'}`.
- If `room.owner_email !== req.user.email` → 403 `{error:'forbidden'}`. **No reveal of "room exists but you're not owner" vs "room doesn't exist"** — return 403 for both cases to prevent enumeration. (Actually wait — 403 for not-owner is fine; 404 for not-found is fine since rooms are user-owned anyway and the existence-check endpoint is already public. Use 403 for not-owner, 404 for not-found.)
- Call `getOpenSessionFor(roomId, hostEmail, db)` (B1 helper). If null → 409 `{error:'no open meeting session'}` + do NOT write any file.
- If all checks pass, embed `sessionId` in the filename: `<ISO-ts>_<sessionId>_<roomId>_<roomTitleSlug>_<rand6>.webm`. The legacy v1 B5 shape `<ISO-ts>_<roomId>_<roomTitleSlug>_<rand6>.webm` (no sessionId) must remain parseable by `GET /api/recordings` — see Step 2.

### Step 2 — Backward-compat filename parser

Modify the recordings listing/download code:

- Filename parser must extract: timestamp, sessionId (optional), roomId, roomTitleSlug, randomSuffix.
- Two valid shapes (try both, longest-match first):
  - **New (v2):** `<ISO-ts>_<sessionId>_<roomId>_<slug>_<rand>.webm` — sessionId is 36-char UUID; roomId is 12-hex
  - **Old (v1 B5):** `<ISO-ts>_<roomId>_<slug>_<rand>.webm` — no sessionId; roomId is 12-hex

Listing endpoint returns rows with `sessionId: string | null` (null for old-shape files).

### Step 3 — WS protocol extensions in `signaling/index.ts`

Add four host-command handlers (host = `isOwnerOf(currentRoom, ws.userEmail, db)`):

```typescript
// (existing 'join', 'signal', 'admit', 'reject' handlers stay)

if (msg.type === 'recording-state') {
  if (state !== 'admitted') return;
  if (!isOwnerOf(currentRoom, ws.userEmail, db)) {
    console.info('[host-cmd-rejected]', 'recording-state', userEmail, currentRoom);
    return;
  }
  const wireType = msg.state === 'started' ? 'recording-started' : 'recording-stopped';
  const sessionId = live.currentSessionId; // from B1
  for (const [, peer] of live.admitted) {
    send(peer.ws, { type: wireType, clientId, sessionId });
  }
  return;
}

if (msg.type === 'meeting-ended-by-host') {
  if (state !== 'admitted') return;
  if (!isOwnerOf(currentRoom, ws.userEmail, db)) { /* drop + log */ return; }
  closeSession(live.currentSessionId, 'host-end', db);
  for (const [, peer] of live.admitted) {
    send(peer.ws, { type: 'meeting-ended', reason: 'host-end' });
    try { peer.ws.close(); } catch {}
  }
  for (const [, knocker] of live.pending) {
    send(knocker.ws, { type: 'rejected', reason: 'meeting ended by host' });
    try { knocker.ws.close(); } catch {}
  }
  liveRooms.delete(currentRoom);
  return;
}

if (msg.type === 'mute-target') {
  if (state !== 'admitted') return;
  if (!isOwnerOf(currentRoom, ws.userEmail, db)) { /* drop + log */ return; }
  const targetId = String(msg.clientId || '');
  const target = live.admitted.get(targetId);
  if (!target) return; // silently no-op
  send(target.ws, { type: 'mute-request', from: clientId });
  return;
}

if (msg.type === 'remove-peer') {
  if (state !== 'admitted') return;
  if (!isOwnerOf(currentRoom, ws.userEmail, db)) { /* drop + log */ return; }
  const targetId = String(msg.clientId || '');
  const target = live.admitted.get(targetId);
  if (!target) return;
  send(target.ws, { type: 'peer-removed', reason: 'removed by host' });
  try { target.ws.close(); } catch {}
  // close handler will fire and emit peer-left to remaining + session cleanup
  return;
}
```

**Edge cases to handle:**
- `meeting-ended-by-host` while recording is active: the server CANNOT finalize the host's MediaRecorder. The host's CLIENT does that (lands in B8 — see R8.5). For B2, just close the session + broadcast + drop sockets. If the host has been recording, their own client's `recording.service.ts` should detect the WS close and finalize the local Blob on its own. **B8 wires the explicit client-orchestrated flush flow.** B2's responsibility is only the server-side broadcast + session close.
- `remove-peer` on the host themselves: silently no-op (the kebab in B8 will disable on host's own row, so this shouldn't happen — but defensive guard).
- `mute-target` on a peer who's already muted: no-op (peer's client handles the duplicate `mute-request` idempotently in B8).

### Step 4 — Tests

Extend `backend/tests/recording.test.ts`:
- **S2.1** — POST /upload with no cookie → 401 `{error:'unauthorized'}` (current test expects 200 for unauth — UPDATE).
- **S2.2** — POST /upload as authed non-owner → 403 `{error:'forbidden'}`.
- **S2.3** — POST /upload as authed owner BUT no open session → 409 `{error:'no open meeting session'}`.
- **S2.4** — POST /upload as authed owner WITH open session → 200, filename matches `<ts>_<sessionId>_<roomId>_<slug>_<rand>.webm` regex.
- Update existing list/download tests to use the new filename shape OR seed both shapes and verify backward-compat parsing.

New `backend/tests/signaling-host-actions.test.ts`:
- **S2.5** — recording-started/stopped broadcast to all admitted.
- **S2.6** — meeting-ended-by-host: session closes with `host-end` reason, all admitted get `meeting-ended`, sockets close.
- **S2.7** — mute-target: targeted peer only receives `mute-request`.
- **S2.8** — remove-peer: targeted peer receives `peer-removed` + their WS closes; remaining admitted get `peer-left`.
- **S2.9** — non-host issuing any of the four commands: no broadcasts, server logs at info level.

For S2.4 specifically: in test setup, create a room → call `openSession()` directly via the store helper → THEN POST /upload. This avoids needing a full WS join to set up the open session.

For S2.6: opens a session via WS join then sends `meeting-ended-by-host` and asserts:
- DB row has `ended_at` non-null and `ended_reason='host-end'`
- All admitted peers (and pending knockers if any) received `meeting-ended` (or `rejected` for knockers)
- All WS in the room are closed (use `ws.readyState === ws.CLOSED` after a brief settle)
- `liveRooms` map no longer contains the room

### Step 5 — Backward-compat for any leftover v1 recordings

Currently the `recordings/` directory has 0 files (cleaned). So this is theoretical. But the parser still must handle old-shape filenames if seeded — test by writing two files (one old shape, one new shape) and verifying both appear in the listing.

## Required artifacts

`projcore-run-2026-05-19-v2/batch-2/`:
1. `changes.md` (full template + wire-format additions table + auth-trade-off-reversal note)
2. `scenarios-implemented.md` (S2.1-S2.9)
3. `test-report.md`
4. `review.md`
5. `independent-validation.md`
6. `screenshots/` (empty — backend-only)
7. **Decisions:** `decisions/2026-05-19-v2-b2-<slug>.md` for non-trivial autonomous calls (e.g. how `/upload` handles X-Room casing; whether `remove-peer` waits for peer's close handler vs explicit broadcast; how `meeting-ended-by-host` interacts with the existing close handler's session-close to avoid double-close)

## Scope (hard limits)

- **DO** items in Expected.
- **DO NOT** wire the FRONTEND end-meeting flow (B8).
- **DO NOT** wire the FRONTEND recording auth or new filename consumers (B7).
- **DO NOT** broadcast `media-state` (mic/cam change events) — that's B6.
- **DO NOT** pollute prod SQLite in tests.

## Completion protocol

Commit BEFORE STATUS: DONE.

```
STATUS: DONE — v2-B2 host authority + recording binding + 9 scenarios green
```

Append to progress.md + callbacks.md:
```
[projcore callback] v2-batch-2 DONE — host authority + recording binding + WS commands
```

## Model + reasoning guidance

- The trickiest part is `meeting-ended-by-host` interacting with the existing `ws.on('close')` handler. When the server closes a peer's socket after broadcasting `meeting-ended`, the close handler fires and tries to do its own cleanup (admitted.delete, peer-left broadcast, session close). Make sure:
  1. `closeSession` is idempotent (B1 already handles this — `WHERE ... AND ended_at IS NULL`).
  2. The `peer-left` broadcasts in the close handler will fire for each peer as they close — that's fine, harmless because `meeting-ended` already arrived first.
  3. The session is closed BEFORE the close handlers fire, so the close handlers don't try to re-close.
- Cost-aware tier OK. Escalate only if signaling close-cascade gets racy in tests.

— /projcore (Claude, Opus, 2026-05-19)
