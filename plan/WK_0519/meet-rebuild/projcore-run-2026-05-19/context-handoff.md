# context-handoff.md — meet-poc rebuild

Rolling handoff between batches. /projcore writes a new section here before issuing `/compact` (or just file-backed re-dispatch in Pattern 2 since codex runs in its own context).

---

## Pre-B1 handoff (post-B0)

**HEAD:** not-yet-git-init (`meet-poc` is not a git repo; B1 includes `git init`)
**Branch:** n/a — B1 creates `feat/meet-rebuild-b1-backend-foundation`

**What's in the repo today:**
- `server.js` (Express + ws, 371 LOC) — legacy single-file backend
- `public/{index.html, style.css, client.js}` — legacy vanilla FE; has the CSS specificity bug at `style.css:9`
- `data.json` — legacy storage (1 user `jrom@silverjrom.app`, 0 rooms, 9 sessions)
- `INITIAL_PASSWORD.txt` — bootstrap seed (gitignored content; **DO NOT log its contents**)
- `seed.js` — legacy seeder
- `package.json` — depends only on `express` + `ws`
- `ecosystem.config.js` — single PM2 entry `meet-poc` on port 4700
- `recordings/` — saved .webm files (preserve)
- `logs/` — pm2 out/error
- `plan/WK_0519/meet-rebuild/` — this contract (just written)

**What B1 must produce:**
- `legacy-poc/` folder containing all current files except `recordings/`, `plan/`, `INITIAL_PASSWORD.txt`, `.gitignore` — moved bodily
- `backend/` TypeScript scaffold with auth module + SQLite + seed + migrate-from-json
- Root `package.json` with workspaces (`backend`, `frontend` placeholder, `e2e` placeholder)
- `.git/` initialized; first commit = snapshot of current state, then second commit = backend scaffold
- Updated `ecosystem.config.js` with `meet-poc-be` (backend dev), keeping legacy `meet-poc` commented OR moved aside until B6 retires it
- B1 must NOT modify `voice.silverjrom.app` routing — CF Tunnel still points at the legacy entry. New `meet-poc-be` runs on a non-conflicting port (4700 stays legacy for now; new BE on a sibling port like 4720; B6 swaps).

**Decisions already locked (do not re-litigate):**
- Stack: Angular FE + TS Node BE + better-sqlite3 (see project_specs.md § 1)
- REST + HttpClient on FE (NOT GraphQL/Apollo) — autonomous /projcore call
- Single user `jrom@silverjrom.app`
- Soft cap 8 peers / warning at 6
- coturn (deferred to B6)
- Rewrite in place at `~/websites/meet-poc/`

**Standing protocols codex must honor:**
- §2.7a Confirmation-prompt protocol (file-flag callbacks.md before waiting on any destructive prompt)
- §2.7b STATUS-prefix protocol (every callback ends with `STATUS: DONE | BLOCKED | NEEDS-INFO`)
- §1.3.4 Role-boundary HARD RULE (executes only the gaps projcore lists in corrections — does not widen audit)

**Active callback target:** `projcore-run-2026-05-19/callbacks.md` (codex creates on first append).
