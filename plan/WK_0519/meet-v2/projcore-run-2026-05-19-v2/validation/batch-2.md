# Validation — v2-B2 (Backend host authority + recording binding)

**Verdict:** **PASS** (iter 1).
**Validated by:** Claude `/projcore` (Opus), 2026-05-19.

## Gate 1 — Artifacts

All present. 3 decision files: `meeting-end-close-order`, `recording-parser-longest-match`, `upload-auth-before-raw-body`. Gate 7 clean.

## Gate 2 — Diff review

6 atomic commits including the future-mobile-run plan-appendix commit (`bc9048a docs: add future mobile run notes`).

Key surfaces:
- `recording/index.ts` — `requireAuth` wraps `/upload`; cookie-derived user; `room.owner_email` ownership check; `getOpenSessionFor(roomId, hostEmail)` → 409 if null; new filename embeds `meeting_session_id`; backward-compat parser accepts both v1 and v2 shapes (longest-match-first — codex correctly logged).
- `signaling/index.ts` — 4 new host-only handlers: `recording-state`, `meeting-ended-by-host`, `mute-target`, `remove-peer`. Each guards `isOwnerOf` and drops with info-log on non-host attempts.
- **Codex's `meeting-ended-by-host` close-order decision** is the trickiest piece — close session + delete liveRoom entry BEFORE closing peer sockets, so the per-socket `close` handlers don't re-trigger session-close logic. Read the source: `closeSession()` is idempotent (B1 already had `WHERE ... AND ended_at IS NULL`) so even if re-triggered it's a no-op, but the order is cleaner. ✓
- **`upload-auth-before-raw-body` decision:** auth middleware runs BEFORE the 200MB raw body parser, so a 401 short-circuits the upload without consuming 200MB of bandwidth. Smart.
- S1.3 regression in `sessions-lifecycle.test.ts` updated to assert the B2 host-end close path — closes R1.3 PARTIAL.

## Gate 3 — Build

`npm run build` clean (2.07s).

## Gate 4 — Targeted tests

`cd backend && npm test` → **16 files / 39 tests** green (was 15/31 in B1, +1 file +8 tests for B2). All on independent rerun.

## Gate 5 — Evidence quality (5Q)

- Q1 ✓ — real ws clients + real DB + real Express via supertest.
- Q2 ✓ — backend protocol level is right.
- Q3 ✓ N/A (backend).
- Q4 ✓ — 9 scenarios = 9 PASS.
- Q5 ✓ — live smoke (below) confirms all 3 `/upload` gates end-to-end.

### Live smoke evidence (real PM2 :4700)

```
1. /upload no cookie                                 → {"error":"unauthorized"} HTTP 401 ✓
2. /upload authed + no open session                  → {"error":"no open meeting session"} HTTP 409 ✓
3. WS open (held 5s) → /upload mid-session           → HTTP 200, {"ok":true,
   "file":"2026-05-19T04-02-39-930Z_ed76102f-5427-4f07-8dd7-86c3793ccacd_3f324d8be763_TEST_ROOM01_c9a33e.webm",
   "bytes":1040}
   → File on disk: ✓
   → Filename matches R2.3 regex: <ISO-ts>_<sessionId UUIDv4>_<roomId 12-hex>_<slug>_<rand 6-hex>.webm ✓
```

End-to-end confirmed. **Cleaned up the smoke-test recording + session row after** (kept dashboard clean per JROM hygiene rule).

## Gate 6 — Matrix update

R2.1-R2.7 → VERIFIED. R1.3 PARTIAL → VERIFIED (B2 closes the host-end leg).

## Gate 7 — Decisions + project_specs

3 decision files all in proper location with frontmatter + alternatives rejected. `project_specs.md` updated with the new auth/session binding + host-authority WS messages table.

## Verdict

**PASS** — R2.1-R2.7 (7 new VERIFIED) + R1.3 closed from PARTIAL. **Matrix: 12/44 VERIFIED, 32 ASSIGNED, 0 PARTIAL, 0 FAIL.** Cleared for B3 (frontend app shell refactor).
