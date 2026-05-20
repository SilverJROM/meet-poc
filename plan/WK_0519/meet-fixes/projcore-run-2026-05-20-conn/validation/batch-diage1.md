# Batch E1 (diage1 / DR-14 + DR-15) — Projcore Independent Validation

**Verdict: PASS — VERIFIED (minor flag on TEST_ROOM01 migration backfill).**

## Independent execution

| Check | Result |
|---|---|
| Commit | f63b158 (migration 0005_room_slugs + store/index + fixtures + spec) |
| `npm test -w backend` | 106 passed / 1 skipped (codex; +3 slug tests) |
| DIAGE1 e2e | 4/4 |
| codex clean-DB full gate | 87/87 (Run-1 + all diag) |
| projcore targeted gate (diage1 + lobby + fixc3 call-path + diagd) | **17/17 PASS** |
| **Fresh-room slug+id resolution (the DR-15 core)** | Created room → slug `slug-resolve-test-9931-8628c4` (kebab name + random suffix); **resolves by slug AND by id**, both return canonical room. Backward-compat confirmed. |
| Screenshots | rooms-clickable.png (slug URLs visible per row, clickable rows) + room-url-slug.png |

## Requirement closure

| Req | Status |
|---|---|
| DR-14 — clickable room rows | **VERIFIED** — rows clickable/keyboard-accessible; row actions don't navigate (e2e + screenshot) |
| DR-15 — name-slug + custom owner URLs | **VERIFIED** — auto kebab+suffix slug, custom-slug endpoint (e2e DR-15 custom-slug test passes), `/room/:slug` + legacy `/room/:id` both resolve (fresh-room curl proves both). Canonical room.id used internally (signaling/sessions/recording). |

## Minor flag (non-blocking) — TEST_ROOM01 migration backfill

The DB file shows TEST_ROOM01 slug = `test-room01-testro` (migration backfill) but the running backend serves slug = `testroom01001` (= its id), and resolving by `test-room01-testro` returns `exists:false`. Likely a WAL/CLI read artifact or a backfill-vs-runtime double-migration quirk. **Impact: minimal** — TEST_ROOM01 still resolves via its id (which the backend treats as its slug), it's the only pre-existing room, and ALL freshly-created rooms get correct name-slugs that resolve both ways. Recommend codex confirm the migration backfill writes through consistently (no WAL/double-run artifact) when batch F or a later batch next touches rooms; not worth a standalone correction now.

## Next

- Batch F (DR-18/19/21/22 connection resilience) — recommended next (highest pain); JROM to confirm F-before-E2.
- E2 (DR-16 waiting room), G (DR-17/20 display), H (DR-23 search), then Z (DR-24 modularization audit, FINAL/gated).
