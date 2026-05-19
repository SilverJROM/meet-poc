# context-handoff.md — meet-poc rebuild

Rolling handoff between batches.

---

## Pre-B6 handoff (post-B5 PASS) — the cutover batch

**HEAD:** `feat/meet-rebuild-b5-recording` (commit `9dc8754 docs: append batch 5 callback`)
**Branch for B6:** `feat/meet-rebuild-b6-coturn-cutover` — off the B5 HEAD.

**What's in the repo now (post-B5):**
- `backend/` — TS workspace, 4 modules (auth, rooms, signaling, recording). 13 vitest files / 23 tests green.
- `frontend/` — Angular 20 SPA, all pages + services + components (incl. recording wired). `ng build` clean.
- `e2e/` — 3 batches of Playwright tests under `tests/b3-shell-auth/` (8), `tests/b4-call-ui/` (8), `tests/b5-recording/` (3) — **19 e2e tests total**.
- `legacy-poc/` — still serving `voice.silverjrom.app` via PM2 `meet-poc` on port 4700.
- `ecosystem.config.js` — three entries: legacy `meet-poc` (4700), `meet-poc-be` (4720), `meet-poc-fe` (4710).
- `recordings/` (gitignored) — preserves legacy recordings PLUS new uploads from B5.
- `data/` (gitignored) — SQLite live DB.
- `frontend/src/environments/environment.ts` — STUN servers configured; **comment marks the coturn injection point** (R5.2 PARTIAL closure deferred to here).

**Live status:**
- `voice.silverjrom.app` → CF Tunnel → `localhost:4700` (legacy PoC, PM2 pid running since first day, untouched by 5 batches of rebuild).
- New stack at `localhost:4710` (`meet-poc-fe` consolidated) → /api/* + /upload + /ws → `localhost:4720` (`meet-poc-be`) — but NOT yet routed to from CF Tunnel.

**What B6 must produce:**

1. **coturn install + config:**
   - Install `coturn` package on this machine (`apt install coturn`).
   - Write `infra/coturn/turnserver.conf` with a chosen authn model (static-user OR shared-secret REST-style). Recommended: **static-user** for our single-tenant case. Username + credential committed under env (NOT in plain config).
   - Bring coturn online — choices: systemd service (simplest, persistent) OR PM2 entry. **Recommended: systemd.** Verify with `ss -lun | grep <coturn-port>` + `pm2 status` (or `systemctl status coturn`).
   - **All install steps that require sudo MUST flag through the confirmation-prompt protocol** (§2.7a) so /projcore can decide before approval.

2. **Frontend ICE_SERVERS wiring:**
   - Inject coturn URL + credentials into `frontend/src/environments/environment.ts` via env config (NOT hardcoded into source). Build-time substitution OR small `assets/turn-config.json` fetched at app load. Pick one + log the decision.

3. **CF Tunnel route swap:**
   - Update `~/.cloudflared/config.yml` to point `voice.silverjrom.app` from `http://localhost:4700` (legacy) to `http://localhost:4710` (new).
   - **This is a JROM-visible change — surface it via confirmation-prompt protocol BEFORE editing the tunnel config.** /projcore will respond approving the specific change.
   - Reload `cloudflared` (or systemd service if it runs that way).

4. **Legacy retirement:**
   - `pm2 stop meet-poc && pm2 delete meet-poc` (after the swap is verified working).
   - Remove the `meet-poc` entry from `ecosystem.config.js`.
   - Keep `legacy-poc/` directory in the repo for one cycle (preserves rollback path); document deletion as a follow-up.

5. **Rollback documentation (R10.3):**
   - Add a `ROLLBACK.md` (or extend `project_specs.md § 8.5`) with step-by-step:
     - `pm2 start ecosystem.config.js --only meet-poc` (after re-adding the entry from git)
     - update CF Tunnel back to :4700
     - `pm2 stop meet-poc-be meet-poc-fe` if needed
   - Verify the rollback steps are NOT destructive (no rm of `recordings/`, no DB drop).

6. **Final acceptance smoke (R9.5 prep):**
   - After cutover, `curl https://voice.silverjrom.app/` should return Angular `<app-root>` HTML, not the legacy `<title>meet-poc</title>` static.
   - Playwright headed visit (`headed: true` for one spec) to verify the login page is the new one.
   - Document evidence in batch-6/screenshots/ — the most important screenshot for this whole run.

**Standing flags:**
- §2.10 validator discipline + §2.10a targeted-first still apply.
- **Every destructive or live-affecting action MUST flag through §2.7a confirmation-prompt protocol BEFORE executing.** Includes: any sudo command, CF Tunnel config edit, `pm2 stop meet-poc` (the live legacy), `pm2 delete meet-poc`.
- §1.15 decisions/2026-05-19-b6-<slug>.md for each call.
- Commit before STATUS: DONE callback (rule from B4).

**Decisions locked:**
- coturn = ALWAYS run our own (JROM said so on 2026-05-19 intake)
- Rewrite-in-place at `~/websites/meet-poc/` (no separate retire-old-repo step)
- Preserve `recordings/` across cutover (R10.1)

**JROM authorization model for this batch:**
- coturn install via apt = ALWAYS-ESCALATE (sudo). Flag + wait.
- CF Tunnel edit = ALWAYS-ESCALATE (live URL routing). Flag + wait.
- `pm2 stop meet-poc` = ALWAYS-ESCALATE (live service). Flag + wait.
- Everything else (writing config files, ecosystem.config.js edits, ROLLBACK.md) = ALWAYS-OK (per `trust-defaults.md`).

**Active callback target:** `projcore-run-2026-05-19/callbacks.md` + `progress.md`. /projcore monitors callbacks every cycle (§2.8 watchdog).
