# Batch B3b — Changes

## Frontend (new)

### `frontend/src/app/services/telegram-passwordless.service.ts`
- Client for `/api/telegram/passwordless/{start,status,complete,settings,enroll,verify-activate,disable}`

### `frontend/src/app/pages/login/login.page.{ts,html,scss}`
- Telegram icon button beside Sign in (email-first gate)
- Number-match panel + status polling + ineligible/denied/expired states
- Password form unchanged

### `frontend/src/app/components/account-settings/account-settings.component.{ts,html,scss}`
- Always-shown "Passwordless Telegram login" panel
- Enroll → test number + poll → verify-activate; disable with password reauth

### `frontend/src/app/services/auth.service.ts`
- `refreshSession()` — refetch `/api/me` after passwordless complete

## Backend (activation endpoints — were missing from B3a)

### `backend/src/modules/telegram/tg-passwordless.ts`
- `GET /telegram/passwordless/settings` — linked + status (+ pending displayNumber)
- `POST /telegram/passwordless/enroll` — test number-match round (`is_enrollment=1`)
- `POST /telegram/passwordless/verify-activate` — promote to `active` after approved test; session wipe
- `POST /telegram/passwordless/disable` — password reauth → `off` + session wipe + cookie clear

### `backend/tests/tg-passwordless.test.ts`
- +4 activation endpoint tests (48 total in file)

## E2E / UI proof

### `e2e/tests/b3b-passwordless/passwordless-ui.spec.ts`
- Captures login number screen, not-enabled message, settings toggle off/active

### Screenshots
- `batch-B3b/screenshots/login-number-screen.png`
- `batch-B3b/screenshots/login-not-enabled.png`
- `batch-B3b/screenshots/settings-toggle-off.png`
- `batch-B3b/screenshots/settings-toggle-active.png`