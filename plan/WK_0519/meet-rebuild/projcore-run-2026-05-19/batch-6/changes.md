# Batch 6 Changes — Cutover

## Summary

- Retired the legacy `meet-poc` PM2 process.
- Rebound `meet-poc-fe` to port `4700`, which is the existing Cloudflare tunnel origin.
- Started `meet-poc-be` on `4720` and `meet-poc-fe` on `4700`.
- Deleted `legacy-poc/` per JROM directive.
- Added public-host Playwright cutover spec and live-PM2 Playwright config.
- Added `ROLLBACK.md` and updated `project_specs.md` for the post-cutover state.
- coturn remains deferred per JROM; no coturn install/config was attempted.

## Step 1 — Pre-Cutover Capture

Commands run before changes:

```bash
pm2 list
ls recordings/*.webm | wc -l
curl -sI https://voice.silverjrom.app/ | head -10
ss -lntp | grep -E ':4700|:4710|:4720'
git status --short --branch
```

Observed:

- `pm2 list`: legacy `meet-poc` online; no `meet-poc-be` or `meet-poc-fe` process present.
- recordings count before: `6`
- public headers before: Cloudflare -> Express `404`
- port bindings before: `0.0.0.0:4700` held by legacy node process
- git status before B6 branch work: clean

## Commands Run

```bash
pm2 stop meet-poc
pm2 delete meet-poc
ss -lntp | grep ':4700'
npm run build
pm2 start ecosystem.config.js --only meet-poc-be
pm2 start ecosystem.config.js --only meet-poc-fe
pm2 save
curl -s https://voice.silverjrom.app/ | head -30
ls recordings/*.webm | wc -l
npx playwright test tests/b6-cutover/voice-silverjrom-app.spec.ts --config=playwright.public.config.ts
npm test -w backend
npx playwright test tests/b3-shell-auth --config=playwright.live.config.ts
E2E_WS_ORIGIN=ws://localhost:4700 npx playwright test tests/b4-call-ui --config=playwright.live.config.ts
npx playwright test tests/b5-recording --config=playwright.live.config.ts
git rm -r legacy-poc
```

## Step 4 — Post-Cutover Capture

- `curl https://voice.silverjrom.app/` returned Angular build markup with `<app-root></app-root>` and module script tags.
- Raw curl output saved to `screenshots/curl-voice-after.txt`.
- `pm2 list` after cutover saved to `screenshots/pm2-list-after.txt`.
- `ss` showed:
  - `0.0.0.0:4700` -> `meet-poc-fe`
  - `0.0.0.0:4720` -> backend node process
  - no `:4710` listener

## Recordings Preservation

- Before cutover: `6`
- Immediately after cutover: `6`
- After B5 regression tests: `8` because B5 tests intentionally created two new recordings.
- No existing recording files were deleted.

## Deployment Notes

- Cloudflare tunnel config was not edited. The tunnel is token-based and already points at local port `4700`.
- `meet-poc-fe` uses `NODE_ENV=production` so `scripts/serve.js` serves built Angular artifacts instead of proxying to an Angular dev server.
- `meet-poc` legacy PM2 entry was removed from `ecosystem.config.js`.
