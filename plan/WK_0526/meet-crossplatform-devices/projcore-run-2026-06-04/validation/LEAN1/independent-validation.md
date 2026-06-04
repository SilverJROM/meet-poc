# LEAN1 — Independent Validation (3-agent, behavior-preserving): TS1/TS2/TS3 + dead code + TESTH1

**Verdict: SOLID** (projcore + independent 2nd validator both SOLID). Committed by projcore (3-agent). Verifier ≠ fixer.

## Scope (PERFECT — behavior-preserving only)
Only: room.page.ts + transcripts.page.ts (timer field types ReturnType<...>→number|null + window.* prefixing, set/clear pairs preserved), rooms.page.ts (unused DatePipe import removed — clears NG8113), 4 frontend specs (test-double TYPES only, assertions unchanged), 3 backend TEST files (stale expectation refresh). NO backend/src. NO runtime logic change.

## Proof re-run by projcore
- `npx tsc --noEmit` (frontend) = **0 errors** (was 23). ✅
- All 25 frontend `npx tsx` specs pass (assertions unchanged). ✅
- `npx ng build` green (pre-existing stencil/mediapipe warnings only). ✅
- backend full `npx vitest run`: **164 pass, 0 new regressions**; the 3 previously-red targeted files (rooms/sessions-ttl/signaling-waiting-room) now GREEN (8 reds → 2). ✅

## Backend refresh verified against SOURCE (stale-expectation, not bug)
- rooms: slug `[a-f0-9]{4}` matches `crypto.randomBytes(2).toString('hex')` (rooms/index.ts:146); clean slug on fresh DB; `/exists` genuinely returns passwordRequired+isOwner (rooms/index.ts:141-149).
- sessions-ttl: `/api/me` `{user:null, diagnosticsGloballyEnabled:true}` matches auth/index.ts:64.
- signaling-waiting-room: rewritten to a genuine owner `join` WS message exercising the real auto-open path (openRoomForOwnerAdmission, signaling/index.ts:999); genuinely asserts guest promotion (not trivially passing).

## Remaining 2 backend reds — PRE-EXISTING (NOT LEAN1, NOT real bugs)
auth-login S1.1 + migrate-from-json S1.7 fail in isolation AND on the base commit (2nd validator confirmed identical pre-stash). Both assert the old `{email}`-only user object; the app correctly returns `{email, displayName, isAdmin}` and login WORKS (200 + cookie, `[login] OK`). LEAN1 touched neither test nor any backend src. → handled by TESTH2 (trivial expectation refresh) to reach a fully-green baseline before the fan-out.

## No-behavior-change statement
Confirmed: only static types, an unused import, and test expectations changed. No runtime behavior altered anywhere.
