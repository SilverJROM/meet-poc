# Decision: FIX-B3 Recordings Bulk Delete

## Decision

Recordings deletion is filename-driven, but deletion authority is derived from the parsed room id and the authenticated room owner.

## Rationale

- Existing recordings are represented by filenames, not database rows, so the UI and API use `filename` as the stable deletion key.
- The backend rejects unsafe names before path construction, then resolves the target path and verifies it remains inside the recordings directory.
- Bulk delete skips invalid, missing, bogus-room, and non-owned filenames instead of failing the whole batch. This matches the rooms bulk-delete tolerance pattern while avoiding ownership leakage.
- Single delete was added with the bulk endpoint because recordings had no per-row delete affordance and JROM asked for a usable recordings tab management flow.

## Consequences

- Batch delete remains page-scoped in the UI, matching the existing rooms "Select all on page" behavior.
- Future transcript sidecar files are out of scope for FIX-B3 and should be handled in FIX-B2 or a later transcript-tagging batch.
