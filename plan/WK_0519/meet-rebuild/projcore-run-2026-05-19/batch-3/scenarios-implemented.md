# Scenarios Implemented — B3

| Scenario | Status | Test file | Evidence |
|---|---:|---|---|
| S3.1 login page renders and login navigates to dashboard | PASS | `e2e/tests/b3-shell-auth/login.spec.ts` | Real DOM login flow reaches `/dashboard`; screenshot `screenshots/login-page.png`. |
| S3.2 `/dashboard` without session redirects to `/login` | PASS | `e2e/tests/b3-shell-auth/guards.spec.ts` | `page.goto('/dashboard')` ends at `/login`. |
| S3.3 `/login` with active session redirects to `/dashboard` | PASS | `e2e/tests/b3-shell-auth/guards.spec.ts` | `loginAsJrom()` then `page.goto('/login')` ends at `/dashboard`. |
| S3.4 create room via UI | PASS | `e2e/tests/b3-shell-auth/dashboard.spec.ts` | Room appears with share URL, Join, Copy link, Delete; screenshot `screenshots/dashboard-with-room.png`. |
| S3.5 stitched-panel symptom absent | PASS | `e2e/tests/b3-shell-auth/stitched-symptom-absent.spec.ts` | After auth, `input[type="email"]` and `input[type="password"]` both assert `.toHaveCount(0)`. |
| S3.6 logout clears session and routes to login | PASS | `e2e/tests/b3-shell-auth/logout.spec.ts` | Logout navigates to `/login`; browser fetch `/api/me` returns `{user:null}`. |
| S3.7 delete room with confirmation | PASS | `e2e/tests/b3-shell-auth/delete-room.spec.ts` | Deleted room disappears; visiting its `/room/:id` route shows `Room not found`; screenshot `screenshots/room-list-after-delete.png`. |
| S3.8 copy-link copies share URL | PASS | `e2e/tests/b3-shell-auth/dashboard.spec.ts` | Clipboard contents exactly match room share URL from dashboard DOM. |
