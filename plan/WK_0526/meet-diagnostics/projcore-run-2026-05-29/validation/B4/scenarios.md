# B4a Scenarios — All-Sides Per-Participant Attribution (R6, backend-only)

Batch: B4a | Branch: feat/meet-diagnostics-audio-20260529 (@ 2c36c86)
Type: vitest-deterministic (pure backend/store/API — no live WebRTC needed)
Test file target: backend/tests/session-diagnostics.test.ts (extend existing file)
Scope: attribution columns + query helpers only. The reconnect/admittance-gate sub-requirement is DEFERRED.

---

## P-1 — Migration 0013 adds three nullable columns + index; applies exactly once

**Type:** vitest-deterministic
**Roles:** DB schema (migration runner)
**Preconditions:** Fresh in-memory test DB (createTestDb() runs all migrations including 0013)

**Acceptance Criteria:**
After runMigrations() completes on a fresh DB:
- `meeting_session_diagnostics` has column `participant_id TEXT` (nullable, no DEFAULT)
- `meeting_session_diagnostics` has column `participant_name TEXT` (nullable, no DEFAULT)
- `meeting_session_diagnostics` has column `participant_client_key TEXT` (nullable, no DEFAULT)
- An index named `idx_meeting_session_diagnostics_session_participant` exists on `(session_id, participant_id)`
- The `_migrations` table contains exactly one row with `name = '0013_diagnostics_participant_attribution.sql'`
- Running runMigrations() a second time on the same DB does NOT insert a second row for 0013 (idempotent — the runner's `applied.has(file)` guard)

**Steps:**
| # | Action | Expected |
|---|--------|----------|
| 1 | `const db = createTestDb()` — runMigrations() runs automatically | No error thrown |
| 2 | Query `PRAGMA table_info(meeting_session_diagnostics)` | Rows include `{ name: 'participant_id', type: 'TEXT', notnull: 0, dflt_value: null }`, `{ name: 'participant_name', type: 'TEXT', notnull: 0, dflt_value: null }`, `{ name: 'participant_client_key', type: 'TEXT', notnull: 0, dflt_value: null }` |
| 3 | Query `PRAGMA index_list(meeting_session_diagnostics)` | A row with `name = 'idx_meeting_session_diagnostics_session_participant'` is present |
| 4 | Query `PRAGMA index_info('idx_meeting_session_diagnostics_session_participant')` | Columns are `session_id` (seqno 0) and `participant_id` (seqno 1) |
| 5 | `db.prepare("SELECT COUNT(*) AS c FROM _migrations WHERE name = '0013_diagnostics_participant_attribution.sql'").get()` | `{ c: 1 }` |
| 6 | Call `runMigrations(db)` again | Count remains `{ c: 1 }` |

**Verification (vitest assertions):**
```ts
const cols = db.prepare("PRAGMA table_info(meeting_session_diagnostics)").all() as Array<{name:string; type:string; notnull:number; dflt_value:unknown}>;
const colNames = cols.map(c => c.name);
expect(colNames).toContain('participant_id');
expect(colNames).toContain('participant_name');
expect(colNames).toContain('participant_client_key');

const participantIdCol = cols.find(c => c.name === 'participant_id')!;
expect(participantIdCol.notnull).toBe(0);
expect(participantIdCol.dflt_value).toBeNull();

const indexes = db.prepare("PRAGMA index_list(meeting_session_diagnostics)").all() as Array<{name:string}>;
expect(indexes.map(i => i.name)).toContain('idx_meeting_session_diagnostics_session_participant');

const idxCols = db.prepare("PRAGMA index_info('idx_meeting_session_diagnostics_session_participant')").all() as Array<{name:string}>;
expect(idxCols.map(c => c.name)).toEqual(['session_id', 'participant_id']);

const migCount = db.prepare("SELECT COUNT(*) AS c FROM _migrations WHERE name = '0013_diagnostics_participant_attribution.sql'").get() as {c:number};
expect(migCount.c).toBe(1);
runMigrations(db);
const migCountAfter = db.prepare("SELECT COUNT(*) AS c FROM _migrations WHERE name = '0013_diagnostics_participant_attribution.sql'").get() as {c:number};
expect(migCountAfter.c).toBe(1);
```

---

## P-2 — appendDiagnosticsEntry populates the three attribution columns from payload fields

**Type:** vitest-deterministic
**Roles:** store function
**Preconditions:** Fresh DB with migrations; room + session opened; payload carries `participantId`, `clientName`, `clientKey`

**Acceptance Criteria:**
After calling `appendDiagnosticsEntry(sessionId, null, payload, db)` with a payload that includes:
- `participantId: 'owner-participant'`
- `clientName: 'Owner'`
- `clientKey: 'owner-key'`

The inserted row in `meeting_session_diagnostics` has:
- `participant_id = 'owner-participant'`
- `participant_name = 'Owner'`
- `participant_client_key = 'owner-key'`

(All three values are non-null strings matching the payload fields exactly.)

**Steps:**
| # | Action | Expected |
|---|--------|----------|
| 1 | Open session, call `appendDiagnosticsEntry` with full samplePayload() | Returns non-null DiagnosticEntry |
| 2 | Raw query: `SELECT participant_id, participant_name, participant_client_key FROM meeting_session_diagnostics WHERE id = ?` using entry.id | `{ participant_id: 'owner-participant', participant_name: 'Owner', participant_client_key: 'owner-key' }` |

**Verification (vitest assertions):**
```ts
const entry = appendDiagnosticsEntry(session.id, null, samplePayload(), db)!;
expect(entry).not.toBeNull();
const row = db.prepare(
  'SELECT participant_id, participant_name, participant_client_key FROM meeting_session_diagnostics WHERE id = ?'
).get(entry.id) as { participant_id: string; participant_name: string; participant_client_key: string };
expect(row.participant_id).toBe('owner-participant');
expect(row.participant_name).toBe('Owner');
expect(row.participant_client_key).toBe('owner-key');
```

---

## P-3 — Missing identity fields in payload result in NULL columns; no error thrown

**Type:** vitest-deterministic
**Roles:** store function (appendDiagnosticsEntry)
**Preconditions:** Fresh DB; open session

**Acceptance Criteria:**
When a payload omits `participantId`, `clientName`, and `clientKey` entirely:
- `appendDiagnosticsEntry` returns a non-null DiagnosticEntry (insert succeeds)
- The DB row has `participant_id IS NULL`, `participant_name IS NULL`, `participant_client_key IS NULL`
- No exception is thrown

When a payload provides empty-string values for those fields:
- The DB row stores NULL (not `''`) for each — consistent with a nullable/trimmed treatment
  (NOTE: dev must decide trim-to-null vs store-empty; scenarios require NULL for empty-string. If dev chooses to store `''`, update this to match; but NULL is the required default for omitted fields.)

**Steps:**
| # | Action | Expected |
|---|--------|----------|
| 1 | Call `appendDiagnosticsEntry` with `samplePayload({ participantId: undefined, clientName: undefined, clientKey: undefined })` (or a payload with those keys absent) | Returns non-null entry |
| 2 | Raw-query the row by entry.id | `participant_id IS NULL`, `participant_name IS NULL`, `participant_client_key IS NULL` |

**Verification (vitest assertions):**
```ts
const minimalPayload = { kind: 'sample', roomId: 'room', clientId: 'x', createdAt: Date.now() };
const entry = appendDiagnosticsEntry(session.id, null, minimalPayload, db)!;
expect(entry).not.toBeNull();
const row = db.prepare(
  'SELECT participant_id, participant_name, participant_client_key FROM meeting_session_diagnostics WHERE id = ?'
).get(entry.id) as { participant_id: string | null; participant_name: string | null; participant_client_key: string | null };
expect(row.participant_id).toBeNull();
expect(row.participant_name).toBeNull();
expect(row.participant_client_key).toBeNull();
```

---

## P-4 — getDiagnosticsForSession exposes participantId + participantName in each DiagnosticEntry

**Type:** vitest-deterministic
**Roles:** store function (getDiagnosticsForSession)
**Preconditions:** Fresh DB; session with one inserted entry carrying known attribution fields

**Acceptance Criteria:**
The `DiagnosticEntry` type gains two new optional fields: `participantId: string | null` and `participantName: string | null`.
When the inserted row had `participant_id = 'owner-participant'` and `participant_name = 'Owner'`:
- `getDiagnosticsForSession(...).entries[0].participantId === 'owner-participant'`
- `getDiagnosticsForSession(...).entries[0].participantName === 'Owner'`

When the row had NULL attribution (P-3 case):
- `getDiagnosticsForSession(...).entries[0].participantId === null`
- `getDiagnosticsForSession(...).entries[0].participantName === null`

**Steps:**
| # | Action | Expected |
|---|--------|----------|
| 1 | Insert entry via `appendDiagnosticsEntry` with full samplePayload() | OK |
| 2 | `getDiagnosticsForSession(hostEmail, sessionId, db)` | `entries[0].participantId === 'owner-participant'`, `entries[0].participantName === 'Owner'` |
| 3 | Insert second entry with no identity fields (P-3 payload) | OK |
| 4 | `getDiagnosticsForSession` again | `entries[1].participantId === null`, `entries[1].participantName === null` |

**Verification (vitest assertions):**
```ts
const result = getDiagnosticsForSession(hostEmail, session.id, db)!;
expect(result.entries[0].participantId).toBe('owner-participant');
expect(result.entries[0].participantName).toBe('Owner');
// null case
const result2 = getDiagnosticsForSession(hostEmail, session.id, db)!;
expect(result2.entries[1].participantId).toBeNull();
expect(result2.entries[1].participantName).toBeNull();
```

---

## P-5 — getDiagnosticsForSession accepts optional participantId filter; omitting it returns all rows

**Type:** vitest-deterministic
**Roles:** store function (getDiagnosticsForSession)
**Preconditions:** Fresh DB; session with entries for two distinct participants: `'owner-participant'` (3 rows) and `'guest-participant'` (2 rows)

**Acceptance Criteria:**
Function signature: `getDiagnosticsForSession(ownerEmail, sessionId, db, participantId?: string | null)`

- Called with no `participantId` (or `undefined`): returns all 5 entries (unchanged behavior — regression-safe)
- Called with `participantId = 'owner-participant'`: returns exactly 3 entries, all with `participantId === 'owner-participant'`
- Called with `participantId = 'guest-participant'`: returns exactly 2 entries, all with `participantId === 'guest-participant'`
- Called with `participantId = 'nonexistent-participant'`: returns 0 entries (empty array), NOT null
- session + entries shape is preserved in all cases (`result.session` is still present)

**Steps:**
| # | Action | Expected |
|---|--------|----------|
| 1 | Insert 3 entries for 'owner-participant', 2 for 'guest-participant' | OK |
| 2 | `getDiagnosticsForSession(host, sid, db)` (no filter) | `entries.length === 5` |
| 3 | `getDiagnosticsForSession(host, sid, db, 'owner-participant')` | `entries.length === 3`, every entry.participantId === 'owner-participant'` |
| 4 | `getDiagnosticsForSession(host, sid, db, 'guest-participant')` | `entries.length === 2`, every entry.participantId === 'guest-participant'` |
| 5 | `getDiagnosticsForSession(host, sid, db, 'nonexistent-participant')` | `entries.length === 0`, `result` is non-null (session still found) |

**Edge Cases:**
- `participantId = null` behaves identically to omitted (returns all rows)
- Ordering is still by `created_at ASC` within each filtered result

**Verification (vitest assertions):**
```ts
const all = getDiagnosticsForSession(hostEmail, session.id, db)!;
expect(all.entries).toHaveLength(5);

const ownerOnly = getDiagnosticsForSession(hostEmail, session.id, db, 'owner-participant')!;
expect(ownerOnly.entries).toHaveLength(3);
expect(ownerOnly.entries.every(e => e.participantId === 'owner-participant')).toBe(true);
expect(ownerOnly.session).toBeDefined();

const guestOnly = getDiagnosticsForSession(hostEmail, session.id, db, 'guest-participant')!;
expect(guestOnly.entries).toHaveLength(2);

const none = getDiagnosticsForSession(hostEmail, session.id, db, 'nonexistent-participant')!;
expect(none).not.toBeNull();
expect(none.entries).toHaveLength(0);
```

---

## P-6 — getSessionParticipants returns distinct participants with sample counts

**Type:** vitest-deterministic
**Roles:** new store export (getSessionParticipants)
**Preconditions:** Fresh DB; session with entries for `'owner-participant'` (3 rows, name `'Owner'`) and `'guest-participant'` (2 rows, name `'Guest'`)

**Acceptance Criteria:**
New exported function: `getSessionParticipants(ownerEmail: string, sessionId: string, db?: Database): ParticipantSummary[] | null`
where `ParticipantSummary = { participantId: string; participantName: string | null; sampleCount: number }`

- Returns `null` if session doesn't exist or is not owned by `ownerEmail`
- Returns an array of distinct participants ordered by sample count DESC (or any stable deterministic order)
- For the two-participant setup: array has exactly 2 items
  - `{ participantId: 'owner-participant', participantName: 'Owner', sampleCount: 3 }`
  - `{ participantId: 'guest-participant', participantName: 'Guest', sampleCount: 2 }`
- Rows where `participant_id IS NULL` are excluded from the result (they represent pre-migration or identity-less entries)
- Non-owner call returns null (same owner gate as getDiagnosticsForSession)

**Steps:**
| # | Action | Expected |
|---|--------|----------|
| 1 | Insert 3 owner entries, 2 guest entries | OK |
| 2 | `getSessionParticipants(hostEmail, session.id, db)` | Array of length 2 with the values above |
| 3 | `getSessionParticipants('other@example.com', session.id, db)` | `null` |
| 4 | Insert 1 entry with no participantId (P-3 style) | NULL-row inserted |
| 5 | `getSessionParticipants(hostEmail, session.id, db)` | Still length 2 (NULL rows excluded) |

**Verification (vitest assertions):**
```ts
const participants = getSessionParticipants(hostEmail, session.id, db);
expect(participants).not.toBeNull();
expect(participants!).toHaveLength(2);

const ownerP = participants!.find(p => p.participantId === 'owner-participant')!;
expect(ownerP.participantName).toBe('Owner');
expect(ownerP.sampleCount).toBe(3);

const guestP = participants!.find(p => p.participantId === 'guest-participant')!;
expect(guestP.participantName).toBe('Guest');
expect(guestP.sampleCount).toBe(2);

expect(getSessionParticipants('other@example.com', session.id, db)).toBeNull();
```

---

## P-7 — GET /api/meeting-sessions/:sessionId/diagnostics surfaces participants[] and honors ?participantId filter; stays owner-gated; existing shape preserved

**Type:** vitest-deterministic (supertest)
**Roles:** host (authenticated), non-owner (authenticated)
**Preconditions:** Fresh DB; room owned by host; session; entries for two participants via WS admit flow (DR-41 pattern)

**Acceptance Criteria (additive — existing shape must be preserved):**
Response JSON at `GET /api/meeting-sessions/:sid/diagnostics`:
```json
{
  "session": { ...existing session fields (id, roomTitle, hostEmail, etc.)... },
  "entries": [ ...existing entry fields (id, sessionId, kind, createdAtIso, relayUsed, ...)... ],
  "participants": [
    { "participantId": "owner-participant", "participantName": "Owner", "sampleCount": <N> },
    ...
  ]
}
```
- `participants[]` is a NEW top-level key — always present, never undefined (empty array `[]` if no attributed rows)
- Existing `session` and `entries` keys are unchanged (regression-safe)
- Each entry in `entries[]` gains two new fields: `participantId: string | null` and `participantName: string | null`
- `GET .../diagnostics?participantId=owner-participant` returns only that participant's entries (entries[] filtered); participants[] still shows ALL participants in the session (for navigation context)
- `GET .../diagnostics?participantId=nonexistent` returns `entries: []` with 200; participants[] unaffected
- Non-owner authenticated request: still `404`
- Unauthenticated request: still `401` (or `404` — whatever the existing behavior is; do NOT change it)

**Steps:**
| # | Action | Expected |
|---|--------|----------|
| 1 | Host + guest join via WS (DR-41 admit flow); each POSTs one diagnostics entry | Both entries accepted (200) |
| 2 | `GET /api/meeting-sessions/:sid/diagnostics` (host auth) | 200; `participants` array has 2 items; `entries` has 2 items; `entries[*].participantId` present |
| 3 | `GET .../diagnostics?participantId=<ownerParticipantId>` | 200; `entries` has 1 item with matching participantId; `participants` still has 2 items |
| 4 | `GET .../diagnostics?participantId=never-existed` | 200; `entries: []`; `participants` has 2 items |
| 5 | `GET .../diagnostics` (non-owner auth cookie) | 404 |
| 6 | Existing DR-28 assertions on `session` + `entries[0].payload` still pass | No regression |

**Edge Cases:**
- `?participantId=` (empty string) treated as no filter (all entries returned) — same behavior as omitted

**Verification (vitest assertions):**
```ts
const detail = await request(server)
  .get(`/api/meeting-sessions/${sessionId}/diagnostics`)
  .set('Cookie', ownerCookie)
  .expect(200);

// Existing shape preserved
expect(detail.body.session).toMatchObject({ id: sessionId });
expect(detail.body.entries).toHaveLength(2);

// New participants[] key
expect(Array.isArray(detail.body.participants)).toBe(true);
expect(detail.body.participants).toHaveLength(2);
expect(detail.body.participants).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ participantId: ownerParticipantId, participantName: 'Owner', sampleCount: 1 }),
    expect.objectContaining({ participantId: guestParticipantId, participantName: 'Guest', sampleCount: 1 }),
  ])
);

// New participantId/participantName fields on entries
expect(detail.body.entries[0]).toHaveProperty('participantId');
expect(detail.body.entries[0]).toHaveProperty('participantName');

// ?participantId filter
const filtered = await request(server)
  .get(`/api/meeting-sessions/${sessionId}/diagnostics?participantId=${ownerParticipantId}`)
  .set('Cookie', ownerCookie)
  .expect(200);
expect(filtered.body.entries).toHaveLength(1);
expect(filtered.body.entries[0].participantId).toBe(ownerParticipantId);
expect(filtered.body.participants).toHaveLength(2); // unaffected

// Non-owner gate
await request(server)
  .get(`/api/meeting-sessions/${sessionId}/diagnostics`)
  .set('Cookie', nonOwnerCookie)
  .expect(404);
```

---

## P-8 — Two-participant session: both sides stored + attributable; getSessionParticipants returns both; ?participantId isolates each side

**Type:** vitest-deterministic (supertest + WS admit flow)
**Roles:** host + admitted guest
**Preconditions:** Fresh DB; open room; host joins via WS (admitted); guest knocks + is admitted via WS (DR-41 admit flow); each POSTs a diagnostics entry using their own admitted clientId/participantId/clientKey

**Acceptance Criteria (end-to-end attribution check):**
- Host POST with `{ clientId: ownerAdmitted.clientId, participantId: ownerAdmitted.participantId, clientKey: 'owner-key', clientName: 'Owner' }` → 200
- Guest POST with `{ clientId: guestAdmitted.clientId, participantId: guestAdmitted.participantId, clientKey: 'guest-key', clientName: 'Guest' }` → 200
- DB has exactly 2 rows in `meeting_session_diagnostics` for this session
- `getSessionParticipants(hostEmail, sessionId, db)` returns exactly 2 entries:
  - one with `participantId === ownerAdmitted.participantId`, `participantName === 'Owner'`, `sampleCount === 1`
  - one with `participantId === guestAdmitted.participantId`, `participantName === 'Guest'`, `sampleCount === 1`
- GET `.../diagnostics?participantId=<ownerParticipantId>` returns 1 entry — the host's
- GET `.../diagnostics?participantId=<guestParticipantId>` returns 1 entry — the guest's
- Both participant IDs are distinct (ownerAdmitted.participantId !== guestAdmitted.participantId)

**Steps:**
| # | Action | Expected |
|---|--------|----------|
| 1 | Host WS join → admitted; note ownerAdmitted.participantId | Non-null string |
| 2 | Guest WS join → knocking → owner admits → guestAdmitted; note guestAdmitted.participantId | Non-null string, differs from owner's |
| 3 | Host POST diagnostics | 200, entry.participantId === ownerAdmitted.participantId |
| 4 | Guest POST diagnostics (no auth cookie — admitted guest path) | 200, entry.participantId === guestAdmitted.participantId |
| 5 | `getSessionParticipants(hostEmail, sessionId, db)` | Length 2, both participants present with sampleCount 1 |
| 6 | GET `.../diagnostics?participantId=<ownerPid>` | entries: 1 (host's); participants: 2 |
| 7 | GET `.../diagnostics?participantId=<guestPid>` | entries: 1 (guest's); participants: 2 |

**Verification (vitest assertions):**
```ts
// After both POSTs succeed:
const participants = getSessionParticipants(hostEmail, String(ownerAdmitted.sessionId), db);
expect(participants).toHaveLength(2);
expect(participants!.find(p => p.participantId === String(ownerAdmitted.participantId))).toBeDefined();
expect(participants!.find(p => p.participantId === String(guestAdmitted.participantId))).toBeDefined();

// participantIds are distinct
expect(ownerAdmitted.participantId).not.toBe(guestAdmitted.participantId);

// filter isolation
const ownerFiltered = await request(server)
  .get(`/api/meeting-sessions/${ownerAdmitted.sessionId}/diagnostics?participantId=${ownerAdmitted.participantId}`)
  .set('Cookie', ownerCookie).expect(200);
expect(ownerFiltered.body.entries).toHaveLength(1);
expect(ownerFiltered.body.entries[0].participantId).toBe(String(ownerAdmitted.participantId));

const guestFiltered = await request(server)
  .get(`/api/meeting-sessions/${ownerAdmitted.sessionId}/diagnostics?participantId=${guestAdmitted.participantId}`)
  .set('Cookie', ownerCookie).expect(200);
expect(guestFiltered.body.entries).toHaveLength(1);
expect(guestFiltered.body.entries[0].participantId).toBe(String(guestAdmitted.participantId));
```

---

## P-9 — Backend build green + existing test assertions pass (no regression)

**Type:** vitest-deterministic (CI gate)
**Roles:** N/A (build + test runner)
**Preconditions:** All B4a changes applied

**Acceptance Criteria:**
- `tsc --noEmit` exits 0 with no errors on the backend workspace
- All pre-existing vitest tests in `backend/tests/session-diagnostics.test.ts` pass:
  - DR-28 (persists owner-gated diagnostics with active sender track evidence) — PASS
  - DR-41 (accepts diagnostics from admitted guests and rejects never-admitted clients) — PASS
  - DR-28 (retains a bounded number of diagnostics entries per session) — PASS
- No new type errors introduced in:
  - `backend/src/modules/sessions/store.ts` (DiagnosticEntry type, toDiagnosticEntry, getDiagnosticsForSession, appendDiagnosticsEntry)
  - `backend/src/modules/sessions/index.ts` (mapDiagnosticEntry, GET route handler)
- The existing `mapDiagnosticEntry` response shape is additive only — no existing keys removed or renamed

**Steps:**
| # | Action | Expected |
|---|--------|----------|
| 1 | `cd backend && npx tsc --noEmit` | Exit code 0, no stderr |
| 2 | `cd backend && npx vitest run tests/session-diagnostics.test.ts` | All 3 pre-existing tests pass; new B4a tests pass |

**Verification:**
```
PASS  backend/tests/session-diagnostics.test.ts
  meeting session diagnostics API
    ✓ DR-28 persists owner-gated diagnostics with active sender track evidence
    ✓ DR-41 accepts diagnostics from admitted guests and rejects never-admitted clients
    ✓ DR-28 retains a bounded number of diagnostics entries per session
    ✓ P-1 migration 0013 adds three nullable columns + index; applies exactly once
    ✓ P-2 appendDiagnosticsEntry populates attribution columns from payload
    ✓ P-3 missing identity fields insert NULL; no error
    ✓ P-4 getDiagnosticsForSession exposes participantId + participantName
    ✓ P-5 getDiagnosticsForSession optional participantId filter
    ✓ P-6 getSessionParticipants returns distinct participants with sample counts
    ✓ P-7 GET diagnostics endpoint surfaces participants[] and honors ?participantId
    ✓ P-8 two-participant session: both sides stored + attributable
```

---

## Summary

| ID | Scenario | Mode | Test Method |
|----|----------|------|-------------|
| P-1 | Migration 0013 schema (cols + index + idempotency) | vitest-deterministic | PRAGMA queries on in-memory DB |
| P-2 | Attribution columns populated from payload on insert | vitest-deterministic | Direct store fn + raw SQL query |
| P-3 | Missing identity fields → NULL columns; no throw | vitest-deterministic | Direct store fn + raw SQL query |
| P-4 | getDiagnosticsForSession exposes participantId/Name | vitest-deterministic | Store fn return value assertions |
| P-5 | Optional participantId filter on getDiagnosticsForSession | vitest-deterministic | Store fn with/without filter arg |
| P-6 | getSessionParticipants: distinct list + sample counts | vitest-deterministic | New store export assertions |
| P-7 | GET endpoint: participants[] + ?participantId filter + owner gate | vitest-deterministic | supertest HTTP assertions |
| P-8 | Two-participant end-to-end attribution (WS admit flow) | vitest-deterministic | supertest + WS (DR-41 pattern) |
| P-9 | Build green + existing tests pass (regression gate) | vitest-deterministic | tsc + vitest run |

**All 9 scenarios are vitest-deterministic.** No live WebRTC, no browser, no real hardware. P-8 reuses the established WS admit flow from DR-41 in session-diagnostics.test.ts.

**Out of scope (B4a):** isAdmittedDiagnosticPoster reconnect/re-admittance gate (deferred pending JROM security decision), B4b/R7 remote audio health UI scenarios (separate batch).
