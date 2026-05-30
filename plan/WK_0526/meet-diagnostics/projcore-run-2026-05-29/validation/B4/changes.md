# B4a — All-Sides Per-Participant Attribution (R6, attribution + query ONLY)

## Branch
`feat/meet-diagnostics-audio-20260529` — committed ON TOP of `2c36c86` (cut-from sha). No new branch, no merge.

## User Report (verbatim — og-requirements.md R6)
> "R6 — Guest/all-sides reliability + per-participant attribution. Guest participants' diagnostics upload reliably for the whole call (incl. across reconnect), and each stored sample is attributable to the specific participant (clientId / clientName / participantId) and queryable — so a host can review every side of a call, not just their own."

B4a delivers the **attribution + query** half. The across-reconnect upload-reliability half is DEFERRED (see Caveats — pending JROM security decision).

## Root Cause (feature — 1-line what+where)
Per-participant identity (participantId / clientName / clientKey) was persisted ONLY inside `payload_json` and every row was stored under `owner_email = session.host_email`, so a host could not query "every side" of a call — fixed by adding three first-class attribution columns to `meeting_session_diagnostics` plus owner-gated query helpers (migration `0013`, `backend/src/modules/sessions/store.ts`, `backend/src/modules/sessions/index.ts`).

## Code Changes

### NEW: backend/migrations/0013_diagnostics_participant_attribution.sql
- WHAT: Three plain `ALTER TABLE ... ADD COLUMN` (`participant_id TEXT`, `participant_name TEXT`, `participant_client_key TEXT`, all nullable, no DEFAULT) + `CREATE INDEX IF NOT EXISTS idx_meeting_session_diagnostics_session_participant ON meeting_session_diagnostics(session_id, participant_id)`.
- WHY: First-class, queryable attribution columns. Plain ALTER per the `0010_user_profile_admin.sql` precedent; the runner's `applied.has(file)` once-only `_migrations` tracking (`db.ts:50`) is the idempotency guard. Existing rows stay NULL.

### backend/src/modules/sessions/store.ts
- `DiagnosticEntry` type (binding `DiagnosticEntry`): added `participantId: string | null` + `participantName: string | null`. WHY: expose attribution to callers (P-4). `participant_client_key` is stored but intentionally NOT on the public entry (identity secret — kept out of API surface).
- NEW exported type `ParticipantSummary = { participantId: string; participantName: string | null; sampleCount: number }`. WHY: return shape for `getSessionParticipants` (P-6).
- `DiagnosticEntryRow` type: added `participant_id`, `participant_name`, `participant_client_key` (all `string | null`). WHY: match the new SELECT projection.
- NEW helper `coerceIdentity(value: unknown): string | null`: non-string/absent/empty(trimmed) → `null`, never throws. WHY: null-safe coercion for the three columns (P-3).
- `toDiagnosticEntry` (binding `toDiagnosticEntry`): maps `participant_id`/`participant_name` → `participantId`/`participantName` (`?? null`). WHY: surface attribution on every entry (P-4).
- `appendDiagnosticsEntry` (binding `appendDiagnosticsEntry`): added `participantId`/`participantName`/`participantClientKey` to the `entry` object via `coerceIdentity(payload.participantId | payload.clientName | payload.clientKey)`; added the 3 columns to the INSERT column list, the VALUES placeholders, and the bound `.run(...)` params. WHY: populate attribution on insert (P-2/P-3). Retention DELETE and the admit/global-killswitch POST gate ordering are UNTOUCHED.
- `getDiagnosticsForSession` (binding `getDiagnosticsForSession`): added a 4th OPTIONAL param `participantId?: string | null` AFTER `database` (existing call sites unaffected). When truthy → `AND d.participant_id = ?`; when null/undefined → unchanged. SELECT projection now includes the 3 new columns. Ordering still `created_at ASC` (P-4/P-5).
- NEW exported `getSessionParticipants(ownerEmail, sessionId, database = getDb()): ParticipantSummary[] | null` (binding `getSessionParticipants`): owner-gated (non-owner / missing session → `null`, matching the existing null contract). `GROUP BY d.participant_id`, `WHERE ... AND d.participant_id IS NOT NULL` (NULL rows excluded), `MAX(participant_name)` for the display name, `COUNT(d.id)` as `sampleCount`, ordered `sample_count DESC, participant_id ASC` (stable deterministic) (P-6).
- `getDiagnosticsEntry` (private, binding `getDiagnosticsEntry`): SELECT projection now includes the 3 new columns. WHY: `appendDiagnosticsEntry` returns via this fn — entry must carry attribution (P-2/P-4).

### backend/src/modules/sessions/index.ts
- Import: added `getSessionParticipants` from `./store.js`.
- `mapDiagnosticEntry` (binding `mapDiagnosticEntry`): added `participantId: entry.participantId` + `participantName: entry.participantName` (additive — no existing key removed/renamed) (P-7).
- `GET /meeting-sessions/:sessionId/diagnostics` handler: reads `req.query.participantId` via existing `stringOrNull` (empty string → null → no filter), passes it to `getDiagnosticsForSession`; adds top-level `participants` key from `getSessionParticipants(...) || []` (always present, never undefined). Existing `session` + `entries[]` shape preserved; owner-gating (non-owner → 404) unchanged (P-7/P-8).
- The `/diagnostics.json` download route and the POST route are UNTOUCHED (out of B4a scope).

### backend/tests/session-diagnostics.test.ts
- WHAT: Added P-1..P-8 vitest tests (P-7+P-8 merged into one DR-41-style WS-admit end-to-end test, since P-8's two-participant assertions are a superset of P-7's). Imports updated: added `getSessionParticipants`, `runMigrations`; removed unused `createApp` import.
- WHY: Encode the scenarios as the regression gate. 3 pre-existing DR tests untouched.

## Commits
- `[batch-4a] per-participant diagnostics attribution: migration 0013 (participant_id/name/client_key cols + index) + store populate/query/getSessionParticipants + GET participants[] & ?participantId filter + P-1..P-8 tests | scenarios: P-1..P-9` (single commit on `feat/meet-diagnostics-audio-20260529`; see `git log` for hash)

## Verification
- **Backend build:** `cd backend && npm run build` (`tsc -p tsconfig.json`) → **PASS** (exit 0, no errors).
- **Backend tests:** `cd backend && npx vitest run tests/session-diagnostics.test.ts` → **PASS** — 10/10 tests:
  - DR-28 persists owner-gated diagnostics ✓
  - DR-41 accepts diagnostics from admitted guests / rejects never-admitted ✓
  - DR-28 retains bounded entries ✓
  - P-1 migration 0013 cols + index + idempotency ✓
  - P-2 appendDiagnosticsEntry populates attribution ✓
  - P-3 missing identity → NULL, no throw (incl. empty-string → NULL) ✓
  - P-4 getDiagnosticsForSession exposes participantId/Name ✓
  - P-5 optional participantId filter (incl. null === omitted) ✓
  - P-6 getSessionParticipants distinct + sampleCount + non-owner null ✓
  - P-7/P-8 GET participants[] + ?participantId isolation, two-participant WS-admit e2e, non-owner 404 ✓
- **Frontend build:** `cd frontend && npm run build` → **PASS** (output emitted to `dist/meet-poc-frontend`; only PRE-EXISTING warnings — Stencil empty-glob, `@mediapipe/selfie_segmentation` non-ESM, an unrelated `rooms.page.ts` esbuild import note. No FE source touched.)
- **Type-check:** covered by `tsc` build above (clean).
- **Signaling untouched:** `git diff --stat backend/src/modules/signaling/index.ts` → empty (UNCHANGED, as required).
- **Smoke:** localhost only — JROM deploy held per NS6 (not deployed).

## Caveats

### REQUIRED note — reconnect-drop gap (PRE-EXISTING, DEFERRED pending JROM security decision)
`isAdmittedDiagnosticPoster` (signaling/index.ts:511-519) durable-identity reconnect-survival path is gated behind `!poster.clientId` (line 516), but the live client always sends clientId (room.page:2780). A peer that expires from both admitted+reconnecting maps and re-posts with a stale clientId is rejected (403) → diagnostics dropped across longer reconnects. **NOT fixed in B4a** — pending JROM sign-off on relaxing the admittance gate (security boundary). Left **UNCHANGED intentionally**; tracked by projcore. (This is the legal documented-deferral — a JROM-flagged security path, not a silent omission.)

### PRE-EXISTING — participant_client_key not exposed via API
`participant_client_key` is stored (for parity / future correlation) but intentionally excluded from `DiagnosticEntry` and the GET response — it is a per-client identity secret. Storing-not-exposing matches the brief's "expose at least participantId+participantName" guidance. No action.

### PRE-EXISTING — `/diagnostics.json` download route does not surface participants[] / honor ?participantId
The export-download sibling route (`index.ts`) was left UNTOUCHED per B4a scope (brief lists only the main GET route). It still returns the original `{ session, entries[] }` shape (entries now carry the additive participantId/participantName via the shared `mapDiagnosticEntry`, but no `participants[]` key and no filter). Not in scope; noted, not acted on.

## Standing Rules
None — no cross-cutting pattern emerged beyond the existing store/migration conventions.
