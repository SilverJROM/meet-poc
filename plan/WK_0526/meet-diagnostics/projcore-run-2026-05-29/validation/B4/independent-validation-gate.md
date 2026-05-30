# Independent Validation — B4a-gate (diagnostics admittance gate reconnect-survival fix)

**Validator:** Independent, fresh-eyes, adversarial. Did NOT read plan/scenarios/review. Judged from
the verbatim requirement + `changes-gate.md` + the actual final code (`git show c3ad403:...`) +
`git diff 92d52fc..c3ad403` + my own test/build run.

**Requirement (contract):** R6 — Guest participants' diagnostics upload reliably for the whole call,
incl. across reconnect. A guest whose socket churns (and whose live peer entry expires) must still be
able to upload diagnostics — WITHOUT opening any hole that lets a non-admitted or wrong-user client
upload.

**JROM ruling:** relax the durable diagnostics-gate so a durable admitted identity (anchored by
`clientKey`) survives reconnect even when re-posting with a STALE `clientId` — UNLESS a different live
admitted peer owns that `clientId`.

---

## 1. Tests + build I reproduced myself

```
cd backend && npx vitest run tests/session-diagnostics.test.ts tests/signaling-reconnect.test.ts
→ Test Files  2 passed (2)
→ Tests  25 passed (25)        (session-diagnostics: 13 tests, ALL executed — none skipped;
                                 signaling-reconnect: 12 tests)
```
Confirmed green with my own eyes, including the security-relevant tests by name:
- `DR-28 persists owner-gated diagnostics with active sender track evidence` — PASS (the impersonation
  regression test: otherCookie POSTing owner's live clientId+participantId → 403; unauthenticated
  never-admitted → 403; owner self → 200).
- `G-1 accepts a durable admitted guest re-posting with a STALE clientId after reconnect grace expiry` — PASS (the bug-fix repro).
- `G-2 still accepts a durable admitted guest re-posting with clientId OMITTED after grace expiry` — PASS (pre-existing behavior preserved).
- `G-3 rejects a never-admitted clientKey even with a plausible clientId` — PASS (security floor).

```
cd backend && npm run build   (tsc -p tsconfig.json)  → EXIT 0, clean.
```

Note (discrepancy, in the safe direction): `changes-gate.md §Full suites` claims "13 tests | 12 skipped".
My run executed all 13 session-diagnostics tests (0 skipped). That is *more* coverage than claimed, not
less, so it does not weaken the gate — flagged only for accuracy.

---

## 2. The exact change under review (`git diff 92d52fc..c3ad403`)

Only `isAdmittedDiagnosticPoster`'s durable-identity block changed. Before: accepted only when
`identity.wasAdmitted && !revoked && participantId-match && !poster.clientId`. After: same three
identity predicates, then:

```ts
if (!poster.clientId) return true;              // unchanged behavior
if (!live.admitted.has(poster.clientId)) return true;   // NEW: stale clientId of an EXPIRED peer
```

The `!poster.clientId` guard that used to gate the whole block was removed and replaced by these two
explicit lines *inside* the (unchanged) identity-validity condition. Nothing else in the diff.

---

## 3. Adversarial security analysis — hunting for a 200 that should be a 403

### (a) NEVER-ADMITTED client → must be 403. CONFIRMED 403.
The durable block is only reachable past the three identity predicates:
`identity?.wasAdmitted === true && identity.revoked !== true && identity.participantId === poster.participantId`.
`clientIdentities` is keyed by `clientKey` and written **only** by `rememberClientIdentity` /
`revokeClientIdentity`. `rememberClientIdentity(..., wasAdmitted)` is called with `false` at every plain
join (`:938`) and `true` only on the admit/resume path (`:730`, `:977`) — i.e. `wasAdmitted=true` is
reachable **only after a real admit**. A client with no `clientIdentities` entry → `identity` undefined →
block skipped. A client with `wasAdmitted=false` → predicate fails → block skipped. Both fall through to
the final `return false` → 403. G-3 proves this black-box (unknown clientKey → 403). AIRTIGHT.

### (b) REVOKED identity (explicit leave) → must be 403. CONFIRMED 403.
`revokeClientIdentity` (`:418`, called on `peer-left` at `:1303`) sets `wasAdmitted:false, revoked:true`.
The durable predicate requires `revoked !== true`, so a revoked entry fails it and the block is skipped.
Path-1/path-2 also miss (peer gone from both live maps). → final `return false` → 403. AIRTIGHT. (And
`rememberClientIdentity`'s merge logic only *re-sets* `revoked:false` on a genuine `wasAdmitted=true`
re-admit, never on a plain join — so a revoked identity cannot silently un-revoke itself by re-joining
the queue without being admitted again.)

### (c) IMPERSONATION — authenticated user A POSTs as live peer B (B's clientId+participantId+clientKey) → must be 403. CONFIRMED 403. THIS IS THE LOAD-BEARING CASE.
Traced end to end:
- `poster.userEmail` is **server-derived** from the session cookie via `optionalUserEmail` (sessions/index.ts:73)
  and overwrites any body field — the attacker cannot forge it.
- **Path-1** (live.admitted loop) iterates B's live entry. `peerMatchesDiagnosticPoster` matches clientKey,
  participantId, and `poster.clientId === B.clientId`, but then hits
  `if (poster.userEmail !== undefined && poster.userEmail !== peer.userEmail) return false` — A's email
  ≠ B's email → **false**. Path-1 rejects.
- **Path-2** (reconnecting loop): B is live, not reconnecting → no match.
- **Durable branch:** B's `clientKey` resolves to B's durable identity (wasAdmitted, !revoked,
  participantId match) so the block IS entered. But `poster.clientId` is truthy (B's id) so the first
  `return true` is skipped, and `live.admitted.has(poster.clientId)` is **TRUE** (B is live under that id),
  so `!live.admitted.has(...)` is FALSE → the second `return true` does NOT fire. Control falls through to
  `return false` → **403**.

**Is the durable branch EVER able to return true while a live peer owns poster.clientId?** No. The only two
`return true` exits are guarded by `!poster.clientId` and `!live.admitted.has(poster.clientId)`. The first
requires the clientId absent; the second requires NO live admitted peer owns it. When a live peer owns it,
**neither** guard is satisfiable. So whenever path-1's `userEmail` check is the deciding authority (a live
clientId), the durable branch is provably inert and cannot override it. The hole the `changes-gate.md`
describes (the brief's `ownedByDifferentPeer` predicate that matched on clientKey+participantId and would
have short-circuited 200) is genuinely closed by the stronger `!live.admitted.has(...)` form. DR-28
confirms empirically: PASS. AIRTIGHT.

(Edge: A re-uses B's clientKey while B is EXPIRED — but then it is no longer impersonation of a live peer;
it is the legitimate durable owner of that clientKey re-posting. The durable branch deliberately accepts
that — clientKey is the post-admission-only anchor and is the intended identity here. No live peer is
harmed; this is exactly the R6 case, not a hole.)

### (d) Genuine reconnect (the bug being fixed) → must be 200. CONFIRMED 200.
G-1 drives the real churn: guest admitted → `terminate()` → `peer-reconnecting` → advance past
`DISCONNECT_GRACE_MS` (120_001ms) → `expireReconnectingPeer` → `cleanupReconnectState`, which deletes
`reconnecting`/`shareGrants`/`reconnectTickets` but does **NOT** touch `clientIdentities` (verified at
`:329-337`). The durable identity survives with `wasAdmitted=true, revoked=false`. POST with the STALE
`clientId` → durable block: `poster.clientId` truthy but `!live.admitted.has(staleId)` is TRUE (peer
expired out of admitted) → `return true` → **200**, and GET shows the entry with the right
clientName/clientKey. G-1 PASS. The R6 gap is closed.

---

## 4. Scope check — ONLY the durable block changed

`git diff 92d52fc..c3ad403 -- backend/src` shows a single hunk in `signaling/index.ts`'s durable block.
Verified untouched in the final code:
- `peerMatchesDiagnosticPoster` (:489-499) — unchanged; still enforces clientKey, participantId,
  clientId-equality, and `userEmail`.
- Path-1 (live.admitted loop) and path-2 (reconnecting loop) — unchanged.
- POST gate ordering in `sessions/index.ts:154-170` — unchanged (admittance check → 403, then global
  enabled flag, then append). `userEmail` still server-derived, body never trusted for it.
- `cleanupReconnectState`, `rememberClientIdentity`, `revokeClientIdentity`, `ClientIdentity` type — unchanged.
- Frontend — no files in the diff.

Test file changes (`session-diagnostics.test.ts`) are additive (G-1/G-2/G-3 + `vi`/`afterEach` timer
hygiene) and do not weaken any existing assertion; DR-28 and DR-41 still run and pass.

---

## 5. Verdict

The relaxation does exactly what JROM ruled and nothing more. The durable branch's two `return true`
exits are mathematically unable to fire while any live admitted peer owns the supplied `clientId`, so the
live-admitted path (which alone enforces `userEmail`) remains the sole authority for live clientIds — no
impersonation hole. Never-admitted (a) and revoked (b) identities cannot reach a `return true`. The genuine
expired-reconnect case (d) now returns 200, closing the R6 reliability gap. Tests (25/25) and build (exit 0)
reproduced green by me. Scope is the single intended block.

**STATUS: PASS**
