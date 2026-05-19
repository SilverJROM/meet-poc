---
date: 2026-05-19
batch: B1
type: autonomous-call
source: codex-implementer (logged retroactively by /projcore — codex put this in changes.md§Autonomous Decisions but not the per-run decisions/ folder; §1.10 gate 7 calls for it here too)
priority: low
search_hooks: [legacy-poc, recordings-path, meet-poc-b1, file-move]
---

**Decision:** Adjusted `legacy-poc/server.js` `RECORDINGS_DIR` to `path.join(ROOT, '../recordings')` (effectively repo-root `recordings/`) when moving the legacy server into the `legacy-poc/` subdir.

**Trigger context:** B1 moved the legacy single-file server.js into `legacy-poc/`. The legacy code used `RECORDINGS_DIR = path.join(ROOT, 'recordings')` with `ROOT = __dirname`. After the move, `__dirname` resolves to `legacy-poc/`, so without adjustment, future legacy-mode recording uploads would write to `legacy-poc/recordings/` (separate from the repo-root `recordings/` that already contains existing files preserved per R10.1).

**Alternatives considered:**
- Leave legacy broken: acceptable since B6 retires legacy entirely, but it could mask issues during the rebuild if JROM tested legacy mid-flight.
- Move `recordings/` into `legacy-poc/`: would split recordings storage between old and new, complicate R10.1.

**Codex's call:** point legacy at repo-root `recordings/` via `../recordings`. Simplest; preserves R10.1.

**/projcore verdict:** correct. Convention-conformant. Risk is zero (legacy retires in B6).

**Future relevance:** B6 will delete `legacy-poc/` entirely; this fix decays then.
