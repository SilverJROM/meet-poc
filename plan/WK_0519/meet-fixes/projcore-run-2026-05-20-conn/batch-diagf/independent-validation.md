# DIAGF Independent Validation

Validation was run against a clean isolated database and isolated ports.

## Evidence

- Backend full suite: 108 passed / 1 skipped.
- DIAGF e2e: 2 passed.
- Clean Run-1 plus diag gate: 89 passed.
- Explicit leave regression checks: passed.
- Screenshots:
  - `screenshots/reconnect-no-ghost.png`
  - `screenshots/grace-recovering.png`

## Requirement Mapping

- DR-18: Guest reconnect resumes silently with reconnect token and no readmit.
- DR-19: Transient disconnect freezes the existing tile; `peer-resumed` reconciles the old and new ids; explicit leave still removes.
- DR-21: Owner reconnect resumes by authenticated owner identity.
- DR-22: ICE disconnect enters a recovering state and keeps the tile/audio during the grace window.

## Cleanup

Validation used `/tmp/meet-diagf-full.sqlite` and isolated test ports. No live dashboard test rooms were created.
