# Batch B6 — Cutover (port rebind, no tunnel edit, coturn deferred)

**Persona switch:** Invoke `$lead`. Claude `/projcore` supervises.

**Batch ID:** B6
**Branch:** `feat/meet-rebuild-b6-cutover` — off B5 HEAD.

**Important context:** JROM revised the original B6 scope at 2026-05-19. Key changes from `prompts/batch-6.md` (the original, now superseded):

1. **coturn install is DEFERRED.** Don't run `apt install coturn`, don't write `infra/coturn/`. STUN-only ICE_SERVERS stays. R7.1, R7.2, R7.3 remain ASSIGNED (logged as deferred in matrix). R5.2 stays PARTIAL. JROM will request coturn in a future targeted batch when a real call needs it.

2. **CF Tunnel does NOT need editing.** Discovered by /projcore: cloudflared runs as a systemd service with a **token-based named tunnel** (`/usr/bin/cloudflared --no-autoupdate tunnel run --token ...`). The hostname mapping `voice.silverjrom.app` → `localhost:4700` is configured in **Cloudflare's Zero Trust dashboard**, not in any local file. There is no `~/.cloudflared/config.yml`. Re-routing via the dashboard is JROM's responsibility if ever needed.
   - **Instead, rebind the new app's consolidated proxy to port 4700** (was 4710). The CF Tunnel hostname already points at 4700 (currently serving legacy). When legacy stops + `meet-poc-fe` starts on 4700, the tunnel automatically serves the new app.

3. **JROM's directives verbatim (2026-05-19):**
   - *"delete the old app please indiscrimintely and use this updated one on the port"*
   - *"the old app is deprecated just delete it indiscriminately no need to step on eggshells here"*

   Net effect: **delete `legacy-poc/` entirely** in this batch. No rollback preservation. No "keep for one cycle" hedging. Passwordless sudo confirmed available, but B6 should not need any sudo.

**Requirements assigned (revised):**
- **R5.2 (still PARTIAL — JROM-deferred)** — STUN-only stays; coturn deferred
- **R7.1, R7.2, R7.3** — DEFERRED per JROM; document in matrix as `DEFERRED` status (treat as ASSIGNED but flagged "JROM deferred 2026-05-19")
- **R8.3** — CF Tunnel routes voice.silverjrom.app to new port → **closes via port rebind to 4700** (no tunnel edit)
- **R8.4** — old `meet-poc` PM2 entry retired
- **R8.5 (closure)** — build pipeline produces deployable artifacts (final form)
- **R10.1** — pre-cutover recordings preserved
- **R10.3** — rollback path documented + dry-runnable

---

## Expected (acceptance criteria)

### Step 1 — Pre-cutover state capture

Run + record in `changes.md`:
- `pm2 list` — current state
- `ls recordings/*.webm | wc -l` — recordings count BEFORE
- `curl -sI https://voice.silverjrom.app/ | head -10` — current response headers
- `ss -lntp | grep -E ':4700|:4710|:4720'` — current port bindings
- `git status` — clean tree expected

### Step 2 — Stop the legacy

```bash
pm2 stop meet-poc
pm2 delete meet-poc
```

No sudo needed. Verify port 4700 is freed: `ss -lntp | grep :4700` should be empty.

### Step 3 — Rebind meet-poc-fe to port 4700

Edit `ecosystem.config.js`:
- **Remove** the `meet-poc` (legacy) entry entirely
- **Change** `meet-poc-fe` env `PORT: 4710` → `PORT: 4700`
- Keep `meet-poc-be` unchanged (port 4720)
- Keep all other ecosystem fields untouched

Then:
```bash
pm2 delete meet-poc-fe   # important: PM2 caches env, delete+start to pick up new PORT
pm2 start ecosystem.config.js --only meet-poc-fe
pm2 save
```

Verify: `ss -lntp | grep :4700` shows `meet-poc-fe` listening; `pm2 list` shows `meet-poc` is GONE.

### Step 4 — Live smoke against voice.silverjrom.app

After the rebind, wait 2-3 seconds for CF Tunnel to notice the new origin:

```bash
curl -s https://voice.silverjrom.app/ | head -30
```

Expected: Angular `<app-root></app-root>` markup + Angular bundle script tags (not the old `<title>meet-poc</title>` static HTML with the stitched panels).

Save the raw curl output to `batch-6/screenshots/curl-voice-after.txt` (text file inside screenshots/ is fine).

### Step 5 — Headed Playwright verification

Add a one-off acceptance spec `e2e/tests/b6-cutover/voice-silverjrom-app.spec.ts`:

```typescript
import { expect, test } from '@playwright/test';

test('S6.3 voice.silverjrom.app serves the Angular app', async ({ page }) => {
  await page.goto('https://voice.silverjrom.app/');
  // The login page is one of the lazy-loaded chunks; assert on the form
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.locator('button:has-text("Sign in")')).toBeVisible();
  await page.screenshot({ path: '../plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/batch-6/screenshots/voice-silverjrom-app-new.png', fullPage: true });
});
```

This spec runs against the public URL — NOT the local baseURL. Override:

```bash
npx playwright test tests/b6-cutover/voice-silverjrom-app.spec.ts \
  --config=e2e/playwright.config.ts -- 
```

If config baseURL gets in the way, use absolute URL inside `page.goto(...)` and pass `--config` that doesn't override.

### Step 6 — Recordings preservation (R10.1)

`ls recordings/*.webm | wc -l` — record count AFTER cutover. Must equal pre-cutover count.

### Step 7 — Delete legacy-poc/ + brief rollback note (R10.3)

**JROM directive 2026-05-19:** *"the old app is deprecated just delete it indiscriminately no need to step on eggshells here"*.

Execute:
```bash
rm -rf legacy-poc/
git add -A   # captures the deletion
```

Then write a SHORT `ROLLBACK.md` at repo root for posterity (closes R10.3 at minimum):

```markdown
# Rollback (historical)

The legacy single-file `meet-poc` PoC was deleted at the B6 cutover per JROM directive. The new TypeScript + Angular app at voice.silverjrom.app replaced it on 2026-05-19.

To recover the legacy source code, check out the commit immediately before `feat/meet-rebuild-b6-cutover` (or read it directly from git history: `git show <legacy-snapshot-commit-sha>:server.js`).

`recordings/` directory was NOT touched at cutover — all .webm files prior to and during the rebuild remain on disk.

This rebuild was a non-incremental replacement. No supported rollback path exists post-deletion — restore from git history if ever needed.
```

### Step 8 — Final regression sweep

Per /projcore §2.10a — per-module first:
```bash
cd backend && npm test                          # 13/23 should still pass
npm test -w e2e -- tests/b3-shell-auth          # 8/8
npm test -w e2e -- tests/b4-call-ui             # 8/8
npm test -w e2e -- tests/b5-recording           # 3/3
```

Full e2e is Phase 2 (/projcore Phase 2 runs the fresh-context final validation).

## Scope (hard limits)

- **DO NOT** install coturn — JROM deferred.
- **DO NOT** edit Cloudflare tunnel config (no local file anyway; would require Cloudflare dashboard).
- **DELETE** `legacy-poc/` in this batch (Step 7). JROM directive 2026-05-19 — "indiscriminately delete the old app, no need to step on eggshells." Legacy source is preserved in git history if ever needed; no disk-level copy required.
- **DO NOT** touch `recordings/` files.
- **DO NOT** modify backend or frontend application code.
- **DO NOT** push to any git remote.

## Required artifacts

`projcore-run-2026-05-19/batch-6/`:
1. `changes.md` — Step 1 capture (pre-cutover), Step 4 capture (post-cutover), recordings count before/after, full set of pm2 + bash commands run
2. `scenarios-implemented.md` — S6.1 (N/A coturn deferred), S6.2 (N/A deferred), **S6.3 PASS via the new spec**, S6.4 PASS via the headed test, S6.5 PASS (recordings count), S6.6 (rollback doc — note "documented, not dry-run-tested unless trivial" if you don't actually execute it)
3. `test-report.md` — Step 8 outputs
4. `review.md`
5. `independent-validation.md`
6. `screenshots/` — voice-silverjrom-app-new.png (from Playwright), curl-voice-after.txt (Step 4), pm2-list-after.txt (`pm2 list > pm2-list-after.txt`)
7. **Decisions:** `decisions/2026-05-19-b6-port-rebind-vs-tunnel-edit.md` documenting WHY port rebind beats tunnel edit (token-based tunnel)

## Completion protocol

Commit BEFORE STATUS: DONE callback.

```
STATUS: DONE — B6 cutover complete; voice.silverjrom.app serves the new Angular app; legacy retired; rollback documented; coturn DEFERRED per JROM
```

Append to `progress.md` and `callbacks.md`:
```
[projcore callback] batch-6 DONE — port-rebind cutover; voice.silverjrom.app on new app; legacy gone
```

## Confirmation-prompt protocol — minimal in this batch

The B6-lite path needs **no sudo** and **no live-config-file edits outside the repo**. Confirmation protocol only fires if you hit something unexpected (e.g. port 4700 won't free, CF Tunnel doesn't pick up the new origin within 60s). In that case, flag and wait.

## Model + reasoning guidance

- This is mostly procedural — pm2 commands + one ecosystem.config.js edit + one new Playwright spec + one ROLLBACK.md.
- The risk is mostly "did port 4700 actually free up" / "did CF Tunnel pick up the new origin" — verifications are in the steps.
- If `curl voice.silverjrom.app` returns old content for >60s after rebind, do NOT force anything; flag + wait. /projcore will investigate (could be CF edge caching).

— /projcore (Claude, Opus, 2026-05-19)
