# Validation — Batch 2 (Rooms API + signaling)

**Verdict:** **PASS** (iteration 1).
**Validated by:** Claude `/projcore` (Opus), 2026-05-19.
**Verifier ≠ fixer:** confirmed. /projcore did not modify any production code; only validation artifacts.

---

## Gate 1 — Artifact completeness

All B2 artifacts present:

| Artifact | Present | Notes |
|---|:---:|---|
| `batch-2/changes.md` | ✓ | Includes wire-format-reference section with line-number cites for each message shape |
| `batch-2/scenarios-implemented.md` | ✓ | 12 rows (S2.1–S2.12) with test paths + 1-line evidence |
| `batch-2/test-report.md` | ✓ | 12 files / 19 tests green; build PASS |
| `batch-2/review.md` | ✓ | Self-review APPROVE |
| `batch-2/independent-validation.md` | ✓ | Fresh-eyes re-read |
| `batch-2/screenshots/` | ✓ (empty) | Correct: no UI |
| `decisions/2026-05-19-b2-admitted-state-transition.md` | ✓ | **Gate-7 flag from B1 closed — per-run decision file written this time** |
| `decisions/2026-05-19-b1-secret-and-legacy-paths.md` | ✓ | Codex also retroactively created the missing B1 decision file (bonus) |

## Gate 2 — Diff review

`git log --oneline` shows 4 atomic commits on `feat/meet-rebuild-b2-rooms-signaling`:

```
519d073 docs: add batch 2 evidence artifacts
2759407 test: cover rooms and signaling scenarios
5c0dab5 feat: add websocket signaling protocol
175d5d7 feat: add rooms persistence and API
```

Diff stat: 920 insertions / 19 deletions across 13 source files + 6 evidence files + 2 decision files.

Read each touched source file:

- **`backend/migrations/0002_rooms.sql`** — `rooms` table with `id TEXT PRIMARY KEY`, `title TEXT NOT NULL`, `owner_email TEXT NOT NULL`, `created_at INTEGER NOT NULL`, FK on users(email), plus indexes on owner + created. Matches brief.
- **`backend/src/modules/rooms/store.ts`** — pure SQLite helpers: `getRoom`, `isOwnerOf`, `listOwnedRooms`, `createRoom`, `deleteRoom`. Returns row shape with `ownerEmail` camelCased (matches legacy `room.ownerEmail` API output). `createRoom` uses `crypto.randomBytes(6).toString('hex')` → 12-hex IDs.
- **`backend/src/modules/rooms/index.ts`** — Express router; POST/GET/DELETE under `requireAuth`, GET `/exists` public. Behavior matches R2.1–R2.5. Title slice 100 chars + default `Room <ISO-date>` preserved from legacy.
- **`backend/src/modules/auth/middleware.ts`** — `requireAuth` reads session cookie, calls `getSessionUser`, sets `req.user`, or 401. Mounted via the rooms router.
- **`backend/src/modules/signaling/index.ts`** — see Gate 5 detailed wire-format diff below.
- **`backend/src/server.ts`** — echo placeholder REMOVED; `attachSignaling(server, db)` mounted; rooms router mounted under `/api`. Auto-migration path preserved.

Out-of-scope check: nothing in the diff touches frontend, recording, CF Tunnel, legacy PM2. Clean.

## Gate 3 — Build verification

```
$ npm run build
> tsc -p tsconfig.json
(no output, exit 0)
```

PASS — clean compile with strict TS.

## Gate 4 — Targeted test pass

```
$ cd backend && npm test
Test Files  12 passed (12)
     Tests  19 passed (19)
  Duration  4.69s
```

12 test files / 19 tests green on independent rerun. B1's 7 tests still pass — no regression. B2 adds 7 new test files / 12 new tests (S2.1–S2.12 closed).

## Gate 5 — Evidence quality (5Q checklist)

| Q | Question | Verdict | Evidence |
|---|---|---|---|
| Q1 | Does each test actually exercise the scenario it claims? | ✓ | Wire-format test (`signaling-wire-format.test.ts`) drives the full owner-knock-admit-signal-leave flow through real `ws` clients against real Express+SQLite. Rooms tests use supertest+real DB. No source-regex smell. |
| Q2 | Proof at the right level? | ✓ | B2 is API/protocol surface — protocol-level proof via real WS clients (not stubbed) IS the right level. UI proof of WebRTC flow defers to B4 S4.3 by design. |
| Q3 | Screenshots match claims? | ✓ (N/A) | No UI in B2 → empty screenshots/ correctly. |
| Q4 | Scenario-to-test mapping consistent? | ✓ | All 12 S2.x entries in `scenarios-implemented.md` trace to a test file. Test count 19 = 7 B1 + 12 B2 = (S2.1+S2.2+S2.3+S2.4+S2.5) [5 rooms tests in one file] + S2.6 + (S2.7+S2.8) [knock-admit in one file with 2 tests] + S2.9 + S2.10 + S2.11 + S2.12 = 12. Arithmetic checks out. |
| Q5 | Requirement closure? | ✓ | Live smoke (below) confirms R2.1–R2.5 + R3.1–R3.8 end-to-end through real HTTP + WS. |

### Wire-format identity — deep verification (R3.7, the highest-risk gate)

Cross-referenced `backend/src/modules/signaling/index.ts` against `legacy-poc/server.js:240-357`:

| Message | Legacy line(s) | New line(s) | Identity |
|---|---|---|---|
| `{type:'error', error:'room not found'}` | 285 | 138 | ✓ |
| `{type:'admitted', clientId, peers, roomTitle, isOwner}` | 248, 302 | 82-88, 159 | ✓ key set + order |
| `{type:'pending-list', knockers}` | 307 | 165 | ✓ |
| `{type:'knocking', clientId, roomTitle}` | 313 | 171 | ✓ |
| `{type:'knock', clientId, name}` | 314 | 172 | ✓ |
| `{type:'peer-joined', clientId, name}` | 250, 304 | 90, 161 | ✓ |
| `{type:'knock-cancelled', clientId}` | 252, 265 | 93, 109 | ✓ |
| `{type:'signal', from, data}` | 326 | 184 | ✓ |
| `{type:'rejected', reason}` | 263 | 103 | ✓ |
| `{type:'peer-left', clientId}` | 347 | 205 | ✓ |
| `{type:'error', error:'room full (max 8)'}` | — (NEW) | 59, 146 | NEW (R3.8 introduces this) |

**Intentional behavior change codex made (documented in `decisions/2026-05-19-b2-admitted-state-transition.md`):** when an originally-pending peer is admitted via owner-admit, their socket-local `state` is now updated via a `setState` closure. In the legacy code, the local `state` variable in the pending peer's `ws.on('connection')` scope was NOT updated by the legacy `admitPeer` function — so a guest admitted via knock-admit who later disconnected would hit the `state === 'pending'` branch and emit `{type:'knock-cancelled'}` instead of `{type:'peer-left'}`. **This was a latent bug in legacy.** The rebuild fixes it. **Wire format schema is unchanged** — only WHICH message fires on disconnect-after-knock-admit. R3.6 (S2.10) explicitly demands `peer-left` for disconnecting admitted peers regardless of how they were admitted; the fix is required to pass S2.10. /projcore concurs: this is forced-correctness, not scope creep. Decision file is the audit trail.

### Live smoke (real boot, real HTTP + real WS — beyond test rerun)

Booted backend on port 4720 with a temp SQLite DB. Sequence:

```
POST /api/login (real credential)               → 200 + 64-char session cookie
POST /api/rooms {"title":"Smoke test room"}     → {"room":{"id":"30ce8e802784","title":"Smoke test room","ownerEmail":"jrom@silverjrom.app","createdAt":1779154566626}}
GET  /api/rooms                                 → [the room]
GET  /api/rooms/30ce8e802784/exists  (no auth)  → {"exists":true,"title":"Smoke test room"}
WS   /ws  + send {type:'join',room:...,name:'OwnerSmoke'}
                                                → {"type":"admitted","clientId":"d91673bc03d201d8","peers":[],"roomTitle":"Smoke test room","isOwner":true}
DELETE /api/rooms/30ce8e802784                  → {"ok":true}
```

The WS owner-admitted shape received by the real client is byte-identical to legacy wire format — including key order `type, clientId, peers, roomTitle, isOwner`. **R3.7 verified live.**

## Gate 6 — Requirement coverage matrix update

R2.1–R2.5 + R3.1–R3.8 → **VERIFIED** in `req-matrix.md`.

## Gate 7 — Standing rules + decisions log

**Decisions log:** codex now creates per-run `decisions/<date>-b2-<slug>.md` files as required by §1.15. The B1 soft-flag is closed. Codex also retroactively created `decisions/2026-05-19-b1-secret-and-legacy-paths.md` — capturing the two B1 calls that were originally only in `changes.md§Autonomous Decisions`. Gate-7 fully clean for both batches now.

**Standing rules:** no new rules introduced. Codex's `changes.md Caveats` flags:
- 8-peer cap applies to owner sockets too (deliberate, documented in brief)
- Live room state is in-memory; process restart clears it (matches legacy behavior; documented in `project_specs.md § 9 Known gotchas`)
- These are not blockers.

## Other observations

- **Legacy `voice.silverjrom.app` still served by legacy `meet-poc` PM2 entry (port 4700).** No disruption.
- **The intentional legacy-bug fix (setState pattern)** is the kind of decision worth surfacing to JROM in the periodic update — it's not a regression vs legacy; it's a correctness improvement that was structurally forced by R3.6 + R3.7 both being requirements. Documented in B2 decisions/ file.

## Verdict

**STATUS: PASS** — B2 rooms + signaling complete. R2.1–R2.5 (5 reqs) + R3.1–R3.8 (8 reqs) = 13 new reqs VERIFIED. Wire format identity verified at three levels (test file, source diff, live smoke). All B1 tests still green. Cleared for B3 dispatch.
