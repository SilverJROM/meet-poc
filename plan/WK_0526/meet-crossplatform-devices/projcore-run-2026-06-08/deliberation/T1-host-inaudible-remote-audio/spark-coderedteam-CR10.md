# CR10 Code-Redteam Spark Report

**STATUS: BUGS**
**Date:** 2026-06-08
**Role:** spark

## Scope
- Verify `clientKey` is removed from all readable surfaces (including OLD rows, beacon handling, admin, logs) without breaking admission/reconnect.
- Re-verify CR-fix-6 and CR-fix-7.
- Identify any new bug.

## Findings

### 1) Re-verify result: CR-fix-6 (selected speaker unavailable state resets) — **PASS**
- `selectedSpeakerUnavailable` is explicitly reset in preflight/bootstrap and cleanup paths in room flow so stale UI state is cleared across reconnect and rejoin transitions.
  - Preflight/boot cleanup path: reset added.
  - Call cleanup path: reset added.
- Remote audio blocked state aggregation still derives from service reasons and is unchanged in behavior.
- No additional regressions observed for this part from local code inspection.

### 2) Re-verify result: CR-fix-7 (admission/reconnect path) — **PASS**
- Diagnostic posting continues to gate on admitted participant status via the existing reconnection-aware path.
- The admission check still requires `clientKey` + `participantId` from incoming request data and preserves reconnect fallback behavior.
- This area appears functionally unchanged by CR8/CR10 and should not be broken by the `clientKey` removal work.

### 3) New/remaining bug found: legacy stored diagnostics can still leak `clientKey` **for historical rows**
- New writes strip `clientKey` before persistence at the diagnostic store layer.
- However, historical rows (written before this fix) can still include `clientKey` in `payload_json`.
- Read APIs (`getDiagnosticsForSession` / detail / download) return stored payloads as-is (`parsePayload(row.payload_json)`), so previously stored `clientKey` is still exposed on readable diagnostic list/detail/download surfaces.
- This is an `ALL readable surfaces` gap in the “OLD rows” class and should be treated as incomplete unless read-time redaction or a migration is added.

### 4) Additional issue: test expectation drift
- The diagnostics e2e spec currently expects `entry.payload.clientKey` to exist on current API responses.
- This is now inconsistent with the write-time redaction behavior and indicates a stale test contract.
- It is a spec/test drift issue (not a direct new runtime leak), but it should be corrected so future validation reflects actual contract.

## Concrete surface check summary
- Active append/beacon paths: no `clientKey` in newly persisted payloads; beacon/HTTP share payload object as one pipeline.
- Diagnostic read/list/download response mapping: uses stored payload (no `participant_client_key` top-level field).
- Admin read/write settings: no diagnostic payload retrieval of rows/keys was found in admin endpoints.
- Logs: no direct logging of raw diagnostic payload fields identified in this pass.
- Legacy row gap above remains the only blocking data-exposure issue under this CR.

## Recommendation
- Keep `clientKey` from future writes (already done), then add read-time redaction when serving historical rows (or run backfill migration) to fully satisfy "ALL readable surfaces" across OLD rows.
- Align the e2e assertions with redacted payload contract before the next release validation.
