# Test Report — B3

## Commands

```bash
npm run build
cd backend && npm test
npm test -w e2e -- tests/b3-shell-auth
```

## Build

PASS — root build compiled backend TypeScript and Angular production artifacts.

## Backend Regression

PASS — 12 backend test files, 19 tests.

```text
Test Files  12 passed (12)
     Tests  19 passed (19)
  Duration  4.00s
```

## Playwright B3 Targeted

PASS — 8 browser tests.

```text
Running 8 tests using 6 workers

✓ S3.2 dashboard without session redirects to login
✓ S3.1 login page renders, login succeeds, and navigates to dashboard
✓ S3.6 logout clears session and routes to login
✓ S3.5 no login form exists in the DOM after authentication
✓ S3.4 creates a room and shows it in the dashboard list
✓ S3.7 delete room removes it and deleted room route shows not found
✓ S3.3 login with active session redirects to dashboard
✓ S3.8 copy-link puts the share URL in the clipboard

8 passed (5.7s)
```

## Flakes

None observed in the final run.

## Notes

Initial Playwright setup required installing Chromium with `npx playwright install chromium`. An earlier fixture path issue was fixed so the E2E helper can read root `INITIAL_PASSWORD.txt` without logging it.
