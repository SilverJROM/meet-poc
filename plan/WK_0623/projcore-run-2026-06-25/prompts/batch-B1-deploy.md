# B1 — Build + deploy the frontend (grok, IMPLEMENTER)

**Role:** IMPLEMENTER. **Repo:** ~/websites/meet-poc, branch `main`. **Scope: DEPLOY ONLY — do NOT edit source.** This is mechanical; you are shipping an already-committed, already-validated fix.

## Why
The live frontend bundle is stale (`frontend/dist/meet-poc-frontend/browser/main-*.js` is from Jun 23 12:31), built BEFORE the recording-reliability fix landed (commit `1fbc273`, Jun 24). The fix (`flushRecordingForExit` — upload-before-close) is in source but not deployed. `scripts/serve.js` serves the static `dist/` bundle, so it must be rebuilt.

## Task
1. Confirm staleness first: `ls -la frontend/dist/meet-poc-frontend/browser/main-*.js` (note the old mtime) and `git log -1 --format='%h %ci' -- frontend/src/app/pages/room/room.page.ts`.
2. Build: `cd frontend && npm run build` (Angular `ng build`). Capture the result; it MUST succeed with no errors.
3. Verify the NEW bundle is fresh: `ls -la frontend/dist/meet-poc-frontend/browser/main-*.js` — the mtime must now be today (Jun 25) and the hashed filename likely changed.
4. Confirm serve.js will serve it: `frontend/dist/meet-poc-frontend/browser/index.html` references the new main-*.js. (serve.js reads from disk per request — no restart needed, but if the FE pm2 process caches, note it.)
5. Do NOT restart pm2 or touch anything else unless the build output dir differs from what serve.js expects.

## Acceptance / report
Write a short `validation/B1-deploy-changes.md`: old mtime → new mtime, build success output (last ~10 lines), the new main-*.js filename, and confirmation that `index.html` points to it.

## Callback contract (MANDATORY)
Your FIRST action in your reply (before any prose) MUST be to append your status to `plan/WK_0623/projcore-run-2026-06-25/callbacks/B1.md` — write the line `[callback] B1 grok <STATE> <timestamp>` where STATE is DONE or BLOCKED — THEN do the work / write prose. End your final reply with `STATUS: DONE` (build succeeded, fresh bundle deployed) or `STATUS: BLOCKED <reason>` on the last line.

Do not edit any source file. Do not delete anything outside the build output.
