# Validation — batch-B3b (passwordless TG login UI + activation) — VERDICT: PASS
Date 2026-06-23. Independent gate. Impl: grok composer.
- login.page: TelegramPasswordlessService; email-first guard ("Enter your email first"); start→displayNumber→
  poll status (~2s)→complete→redirect; not-enabled message path. (R3.5)
- settings (account-settings): always-shown activation toggle; 4 authed routes status/enroll/verify-activate/disable;
  enroll→test round→verify-activate; disable-requires-reauth. (R3.6)
- Password login UNCHANGED — TG flow additive. (R3.9) fe-tsc 0; tg-passwordless 48/48 pass.
- UI-PROOF: login-number-screen.png, login-not-enabled.png, settings-toggle-active.png, settings-toggle-off.png.
R3.5/R3.6/R3.9 VERIFIED. B3 COMPLETE.
