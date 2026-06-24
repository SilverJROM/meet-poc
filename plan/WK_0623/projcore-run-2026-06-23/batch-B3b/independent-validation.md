# Batch B3b — Independent validation checklist

1. ✅ Frontend build green (`ng build`)
2. ✅ Backend tsc green (activation routes touched)
3. ✅ `tests/tg-passwordless.test.ts` — 48/48 pass
4. ✅ Playwright UI proof — 2/2 pass
5. ✅ Screenshots exist:
   - `screenshots/login-number-screen.png`
   - `screenshots/login-not-enabled.png`
   - `screenshots/settings-toggle-off.png`
   - `screenshots/settings-toggle-active.png`
6. ✅ Password login form unchanged (additive TG button only)
7. ✅ No git commit (per brief)