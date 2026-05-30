# B4a-gate: Reconnect-Survival Fix — Diagnostics Admittance Gate Scenarios

Batch: B4a (R6 reliability half)
Branch: feat/meet-diagnostics-audio-20260529
Date: 2026-05-30
Test file target: backend/tests/session-diagnostics.test.ts (preferred) or signaling-reconnect.test.ts

---

## Background

`isAdmittedDiagnosticPoster` (backend/src/modules/signaling/index.ts:501-522) has a
durable survivor path at lines 511-519. It accepts a post from a client whose live
peer entry has expired IF:

```
identity.wasAdmitted === true &&
identity.revoked !== true &&
identity.participantId === poster.participantId &&
!poster.clientId        // <-- THE BUG: rejects when clientId is present
```

The live client always sends `clientId` (set to `this.myId()`). So once a peer
expires from both `live.admitted` AND `live.reconnecting` (via
`expireReconnectingPeer` → `cleanupReconnectState`, which does NOT clear
`clientIdentities`), a diagnostics POST carrying the stale `clientId` bypasses the
durable path and returns 403.

THE FIX: relax the `!poster.clientId` guard so a durable identity
(clientKey + participantId + wasAdmitted && !revoked) is accepted EVEN WITH a stale
clientId, UNLESS a DIFFERENT live admitted peer currently owns that clientId (collision
safety). When `poster.clientId` is absent, behavior is unchanged.

DISCONNECT_GRACE_MS = 120 000 ms (2 min).
`vi.advanceTimersByTimeAsync(120_001)` is the reliable timer-flush pattern (see
signaling-reconnect.test.ts:161).

---

## Deterministic Setup (shared across G-1, G-2, G-5)

All scenarios that need an expired peer use the same setup sequence — modelled on
signaling-reconnect.test.ts:133-180:

```ts
const db = createTestDb();
seedUser(db);
const room = createRoom('Gate reconnect', 'jrom@silverjrom.app', db);
setRoomAccess(room.id, { isOpen: true }, 'jrom@silverjrom.app', db);
const ownerCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
const { server, url } = await startWsServer(db);

// Owner joins
const owner = await connectWs(url, ownerCookie);
owner.send(JSON.stringify({ type: 'join', room: room.id, name: 'Owner', supportsReconnect: true }));
const ownerAdmitted = await nextMessage(owner, (msg) => msg.type === 'admitted');
const sessionId = String(ownerAdmitted.sessionId);

// Guest joins + admitted
const guest = await connectWs(url);
guest.send(JSON.stringify({
  type: 'join', room: room.id, name: 'Guest',
  supportsReconnect: true, clientKey: 'durable-gate-key'
}));
const knocking = await nextMessage(guest, (msg) => msg.type === 'knocking');
await nextMessage(owner, (msg) => msg.type === 'knock');
owner.send(JSON.stringify({ type: 'admit', clientId: knocking.clientId }));
const guestAdmitted = await nextMessage(guest, (msg) => msg.type === 'admitted');
// guestAdmitted.clientId  = live clientId the frontend would remember
// guestAdmitted.participantId = stable participantId

// Expire the guest peer (terminate + advance past DISCONNECT_GRACE_MS)
vi.useFakeTimers();
const peerReconnectingPromise = nextMessage(owner, (msg) =>
  msg.type === 'peer-reconnecting' && msg.clientId === knocking.clientId);
guest.terminate();
await peerReconnectingPromise;
await vi.advanceTimersByTimeAsync(120_001);
vi.useRealTimers();
// At this point: guest is absent from live.admitted + live.reconnecting.
// live.clientIdentities.get('durable-gate-key') = {
//   participantId: guestAdmitted.participantId, wasAdmitted: true, revoked: false }
```

---

## Scenarios

---

### G-1 — REPRODUCE-FIRST: Expired guest with stale clientId is rejected before fix, accepted after

**Type:** regression (red → green)
**Roles:** guest (unauthenticated WebSocket)
**Preconditions:** Shared setup above completed. Guest peer fully expired from admitted + reconnecting. Durable clientIdentities entry survives with wasAdmitted=true, revoked=false.

**What is tested:** The exact gap — a diagnostics POST carrying `clientId` (the stale live clientId from `guestAdmitted.clientId`) is rejected on unfixed code (403) and accepted on fixed code (200 + row persisted).

**Acceptance Criteria:**
- Before fix: `POST /api/meeting-sessions/:sessionId/diagnostics` with `clientId = guestAdmitted.clientId`, `participantId = guestAdmitted.participantId`, `clientKey = 'durable-gate-key'` returns HTTP 403.
- After fix: same request returns HTTP 200 and `response.body.entry` is non-null.
- The diagnostics row persists: a subsequent `GET /api/meeting-sessions/:sessionId/diagnostics` (owner-authed) returns `entries` with length >= 1 and `entries[0].payload.clientKey === 'durable-gate-key'`.

**Steps:**

| # | Action | Expected |
|---|--------|----------|
| 1 | Run shared setup; confirm guest peer is expired (no WS connection, grace elapsed). | Setup completes without error. |
| 2 | POST to `/api/meeting-sessions/${sessionId}/diagnostics` with `samplePayload({ clientId: guestAdmitted.clientId, participantId: guestAdmitted.participantId, clientKey: 'durable-gate-key', clientName: 'Guest' })` — no auth cookie. | **BEFORE FIX:** HTTP 403. **AFTER FIX:** HTTP 200, `body.entry` present. |
| 3 | GET `/api/meeting-sessions/${sessionId}/diagnostics` with owner cookie. | `body.entries` length >= 1; `entries[0].payload.clientName === 'Guest'`. |

**Exact vitest assertion (after fix):**
```ts
const res = await request(server)
  .post(`/api/meeting-sessions/${sessionId}/diagnostics`)
  .send(samplePayload({
    clientId: guestAdmitted.clientId,
    participantId: guestAdmitted.participantId,
    clientKey: 'durable-gate-key',
    clientName: 'Guest',
  }))
  .expect(200);
expect(res.body.entry).not.toBeNull();

const detail = await request(server)
  .get(`/api/meeting-sessions/${sessionId}/diagnostics`)
  .set('Cookie', ownerCookie)
  .expect(200);
expect(detail.body.entries.length).toBeGreaterThanOrEqual(1);
expect(detail.body.entries[0].payload.clientName).toBe('Guest');
```

**Reproduce-first assertion (must fail on unfixed code):**
```ts
// Run this BEFORE applying the fix — expect 403:
await request(server)
  .post(`/api/meeting-sessions/${sessionId}/diagnostics`)
  .send(samplePayload({
    clientId: guestAdmitted.clientId,
    participantId: guestAdmitted.participantId,
    clientKey: 'durable-gate-key',
    clientName: 'Guest',
  }))
  .expect(403); // this passes on unfixed code; must be changed to .expect(200) after fix
```

**Edge cases:**
- `clientId` value is `guestAdmitted.clientId` (the original admitted clientId the frontend holds) — a server-assigned UUID, not `knocking.clientId`.

---

### G-2 — No clientId in POST still returns 200 (pre-existing behavior preserved)

**Type:** regression (no change expected — must not regress)
**Roles:** guest (unauthenticated)
**Preconditions:** Shared setup above completed. Guest peer fully expired.

**What is tested:** The pre-existing durable path (`!poster.clientId`) continues to accept posts that omit `clientId`.

**Acceptance Criteria:**
- POST with `clientId` absent (or explicitly `null`), correct `clientKey` + `participantId`, returns HTTP 200 and persists a row.
- This works on BOTH unfixed and fixed code (it is a no-regression check).

**Steps:**

| # | Action | Expected |
|---|--------|----------|
| 1 | Run shared setup; confirm guest peer is expired. | Setup completes without error. |
| 2 | POST to `/api/meeting-sessions/${sessionId}/diagnostics` with `samplePayload({ clientId: undefined, participantId: guestAdmitted.participantId, clientKey: 'durable-gate-key', clientName: 'Guest' })`. | HTTP 200, `body.entry` present. |
| 3 | GET diagnostics with owner cookie. | `entries` length >= 1. |

**Exact vitest assertion:**
```ts
const res = await request(server)
  .post(`/api/meeting-sessions/${sessionId}/diagnostics`)
  .send(samplePayload({
    clientId: undefined,
    participantId: guestAdmitted.participantId,
    clientKey: 'durable-gate-key',
    clientName: 'Guest',
  }))
  .expect(200);
expect(res.body.entry).not.toBeNull();
```

**Edge cases:**
- Also verify with `clientId: null` in the payload body — should produce the same 200.

---

### G-3 — Never-admitted clientKey is rejected (durable path requires real wasAdmitted)

**Type:** security (must hold before and after fix)
**Roles:** anonymous attacker (no WS join, no admission)
**Preconditions:** A live room exists with a session. No connection from the attacker key.

**What is tested:** The fix does NOT open the gate for unknown clientKeys. `clientIdentities` only gains `wasAdmitted=true` after the owner explicitly admits a peer (via `rememberClientIdentity` at line 407-416, called on admit). An unknown clientKey has no entry → durable path returns false → 403.

**Acceptance Criteria:**
- POST with arbitrary `clientKey: 'never-admitted-key'`, a plausible `participantId`, and any `clientId` value returns HTTP 403.
- A POST with the wrong clientKey but the correct participantId of an admitted guest also returns HTTP 403.

**Steps:**

| # | Action | Expected |
|---|--------|----------|
| 1 | Owner joins room, guest joins and is admitted (guest key = 'real-guest-key'). Session established. | Owner and guest both admitted. `sessionId` known. |
| 2 | POST to `/api/meeting-sessions/${sessionId}/diagnostics` with `clientKey: 'never-admitted-key'`, `participantId: guestAdmitted.participantId`, `clientId: guestAdmitted.clientId`. | HTTP 403. |
| 3 | POST same as step 2 but omit `clientId`. | HTTP 403 (durable path entry for 'never-admitted-key' does not exist). |

**Exact vitest assertion:**
```ts
// Step 2
await request(server)
  .post(`/api/meeting-sessions/${sessionId}/diagnostics`)
  .send(samplePayload({
    clientId: guestAdmitted.clientId,
    participantId: guestAdmitted.participantId,
    clientKey: 'never-admitted-key',
    clientName: 'Guest',
  }))
  .expect(403);

// Step 3
await request(server)
  .post(`/api/meeting-sessions/${sessionId}/diagnostics`)
  .send(samplePayload({
    clientId: undefined,
    participantId: guestAdmitted.participantId,
    clientKey: 'never-admitted-key',
    clientName: 'Guest',
  }))
  .expect(403);
```

**Note:** The existing DR-41 test already covers the `clientKey: 'wrong-key'` case (session-diagnostics.test.ts:194-195). This scenario reinforces it post-fix and additionally covers the `clientId`-present variant.

---

### G-4 — Revoked identity (explicit leave) is rejected

**Type:** security (must hold before and after fix)
**Roles:** guest (unauthenticated), then left
**Preconditions:** Guest joined, admitted, then sent an explicit `leave` message → `revokeClientIdentity` sets `revoked: true` in clientIdentities.

**What is tested:** The relaxed gate still requires `identity.revoked !== true`. An explicit leave revokes the durable identity, so subsequent diagnostic posts (with any clientId) are rejected.

**Acceptance Criteria:**
- After an explicit guest leave (not a socket crash, but a `{ type: 'leave' }` WS message), a diagnostics POST with the guest's clientKey + participantId + stale clientId returns HTTP 403.
- Same POST with `clientId` absent also returns HTTP 403 (both branches blocked by revoke).

**Steps:**

| # | Action | Expected |
|---|--------|----------|
| 1 | Owner joins, guest joins with `clientKey: 'leave-key-g4'`, guest is admitted. | Both admitted. `sessionId` known. |
| 2 | Guest sends `{ type: 'leave' }` over WS. | Owner receives `peer-left`. `revokeClientIdentity` runs — `clientIdentities.get('leave-key-g4').revoked === true`. |
| 3 | POST to `/api/meeting-sessions/${sessionId}/diagnostics` with `clientKey: 'leave-key-g4'`, `participantId: guestAdmitted.participantId`, `clientId: guestAdmitted.clientId`. | HTTP 403. |
| 4 | POST same with `clientId: undefined`. | HTTP 403. |

**Exact vitest assertion:**
```ts
guest.send(JSON.stringify({ type: 'leave' }));
await nextMessage(owner, (msg) => msg.type === 'peer-left');

await request(server)
  .post(`/api/meeting-sessions/${sessionId}/diagnostics`)
  .send(samplePayload({
    clientId: guestAdmitted.clientId,
    participantId: guestAdmitted.participantId,
    clientKey: 'leave-key-g4',
    clientName: 'Guest',
  }))
  .expect(403);

await request(server)
  .post(`/api/meeting-sessions/${sessionId}/diagnostics`)
  .send(samplePayload({
    clientId: undefined,
    participantId: guestAdmitted.participantId,
    clientKey: 'leave-key-g4',
    clientName: 'Guest',
  }))
  .expect(403);
```

**Note:** The explicit-leave → revoke path is tested in signaling-reconnect.test.ts:182+. This scenario covers the downstream diagnostics consequence of that path. Reference: `revokeClientIdentity` (signaling/index.ts:418-426).

---

### G-5 — Live admitted peer is still accepted via normal path (no regression for in-call posters)

**Type:** regression (in-call happy path must be unaffected)
**Roles:** guest (live admitted WS)
**Preconditions:** Guest is actively admitted (peer entry in `live.admitted`), session active.

**What is tested:** The fix changes only the durable-path guard. The primary path (live admitted peer match via `peerMatchesDiagnosticPoster`) must be unaffected — a live guest posting with its current `clientId` + `clientKey` + `participantId` returns 200 as before.

**Acceptance Criteria:**
- While guest WS is live and admitted, POST with `clientId = guestAdmitted.clientId`, `participantId = guestAdmitted.participantId`, `clientKey = 'live-guest-key'` returns HTTP 200 and `body.entry` is present.
- No grace timer manipulation needed — guest WS is still connected.

**Steps:**

| # | Action | Expected |
|---|--------|----------|
| 1 | Owner joins, guest (clientKey='live-guest-key') joins and is admitted. Guest WS is NOT terminated. | Both admitted. `sessionId` known. |
| 2 | POST to `/api/meeting-sessions/${sessionId}/diagnostics` with `clientId: guestAdmitted.clientId`, `participantId: guestAdmitted.participantId`, `clientKey: 'live-guest-key'`. | HTTP 200, `body.entry` non-null. |

**Exact vitest assertion:**
```ts
const res = await request(server)
  .post(`/api/meeting-sessions/${sessionId}/diagnostics`)
  .send(samplePayload({
    clientId: guestAdmitted.clientId,
    participantId: guestAdmitted.participantId,
    clientKey: 'live-guest-key',
    clientName: 'Guest',
  }))
  .expect(200);
expect(res.body.entry).not.toBeNull();
```

**Note:** This is substantively covered by the existing DR-41 test (session-diagnostics.test.ts:188-191). The dev may choose to rely on DR-41 as coverage and note it in the test report rather than adding a duplicate.

---

### G-6 — Collision safety: stale clientId owned by a DIFFERENT live peer is rejected (code-reasoning coverage)

**Type:** security (defensive branch)
**Roles:** N/A (not a black-box WS test)
**Preconditions:** N/A

**What is tested:** The relaxed guard must include a check: if `poster.clientId` is present AND a different live admitted peer currently holds that exact `clientId`, the durable path must NOT accept the post. This prevents a theoretical scenario where a recycled UUID (or a crafted request) could use a stale `clientId` that happens to match another live user's socket assignment.

**Why not a deterministic WS test:** Server-assigned `clientId` values are random UUIDs (UUIDs v4 or similar, generated at join time). Two independent WS connections will never naturally produce the same clientId in a test. Forcing a collision would require injecting a known UUID into the server's assignment function, which is not exposed as a test hook. Demanding a forced-collision test would require refactoring production code solely for testability, which is not warranted.

**Acceptance Criteria (code-reasoning, reviewer-verifiable):**
- The fix MUST NOT simply remove the `!poster.clientId` guard without replacement.
- The replacement logic must read approximately: "if `poster.clientId` is present, check live.admitted — if any live admitted peer owns `poster.clientId` but is NOT the durable identity holder (i.e., different `clientKey` or `participantId`), reject."
- Alternatively stated: `poster.clientId` present → accept durable path ONLY IF no live admitted peer has that `clientId` OR the peer that has it matches the durable identity's `participantId`+`clientKey` (which means they rejoined and are now live, making this a redundant-but-safe accept).
- The reviewer (in review.md) must confirm this check is present in the implementation and note the specific lines.

**Verification method:** Reviewer code inspection of the modified `isAdmittedDiagnosticPoster` function. The reviewer must quote the exact guard lines and confirm the collision check is in place.

---

### G-7 — Build green: TypeScript compile + existing test suites pass

**Type:** regression (build + existing tests)
**Roles:** CI / dev machine
**Preconditions:** Fix applied to isAdmittedDiagnosticPoster. No frontend changes.

**Acceptance Criteria:**
- `cd backend && npx tsc --noEmit` exits with code 0.
- `cd backend && npx vitest run tests/signaling-reconnect.test.ts` exits with code 0, all existing tests pass.
- `cd backend && npx vitest run tests/session-diagnostics.test.ts` exits with code 0, all existing tests pass (DR-28, DR-41, P-1).
- No frontend build errors (`cd frontend && npx tsc --noEmit` exits 0, unchanged).

**Exact assertion:**
```
Exit code 0 for each command above.
No new test failures in signaling-reconnect.test.ts or session-diagnostics.test.ts.
```

---

## Coverage Matrix

| Scenario | Covers | Mechanism | Method |
|----------|--------|-----------|--------|
| G-1 | R6 gap closed — stale clientId accepted after grace expiry | durable path + relaxed `!poster.clientId` | vitest red→green |
| G-2 | No regression — absent clientId still accepted | pre-existing `!poster.clientId` branch | vitest green→green |
| G-3 | Security — unknown clientKey rejected | durable path requires `wasAdmitted` entry | vitest assertion |
| G-4 | Security — revoked identity rejected | `revoked: true` guard unchanged | vitest assertion |
| G-5 | No regression — live admitted in-call path unaffected | primary `live.admitted` loop | vitest assertion (or DR-41 ref) |
| G-6 | Security — collision safety on stale clientId | live.admitted ownership check in relaxed guard | code-reasoning + reviewer |
| G-7 | Build/regression — existing suites green | tsc + vitest | CI commands |

---

## Implementation Notes for Dev

- Only `isAdmittedDiagnosticPoster` (signaling/index.ts:511-519) requires change.
- The fix is a single guard substitution: replace `!poster.clientId` with a predicate that accepts when either `!poster.clientId` OR no live admitted peer owns `poster.clientId` as a different identity.
- `cleanupReconnectState` (line 329-337) intentionally does NOT clear `clientIdentities` — this is the mechanism that makes the durable path work. Do NOT change that function.
- `revokeClientIdentity` (line 418-426) is the write path for explicit leave — do NOT change it.
- No frontend changes required. No migration required.
- Suggested test location: add G-1, G-2, G-4 as new `it` blocks in `session-diagnostics.test.ts` (already imports vi, WS helpers, supertest, samplePayload). G-3 can reuse the DR-41 test or be added as a companion. G-5 can reference DR-41 directly.
