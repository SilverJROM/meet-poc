# Queue — User Maintenance + Admin
# Clean structured task list (parsed by overmind gateway). State via token, not label edits.

- [DONE] B1: Schema foundation — display_name + is_admin columns, seed both admins, /api/me exposes them
- [DONE] B2: Username maintenance — set the display name used on calls (R1)
- [DONE] B3: Change password — verify current password then set new (R2)
- [DONE] B4: Change email — cascade across all user-linked tables in one transaction (R3)
- [DONE] B5: Telegram link status and unlink from settings (R4)
- [DONE] B6: Admin tab plus create-user, RBAC-gated server-side (R5, R6)
- [DONE] B7: Settings sub-tabs — Account / LLM / Transcribe (injected 2026-05-28)
- [DONE] B8: Admin user list shows linked Telegram username per user (injected 2026-05-28)
- [DONE] B9: Identity-aware /join — signed-in users join by code as their account, no name field (injected 2026-05-28)
- [DONE] B10: Account backgrounds backend — table + filesystem store + CRUD/serve API + 20MB non-admin total quota + email-cascade (injected 2026-05-28)
- [DONE] B11: Backgrounds Settings tab — upload (720p resize) / delete / quota usage (R-bg)
- [DONE] B12: Picker integration — signed-in users select account backgrounds; guests keep localStorage (R-bg)
- [DONE] B13: Quota 20MB→100MB (non-admin) + fix admin hitting client per-file guard (injected 2026-05-28)
- [DONE] B14: Fix phone upload 413 — global 1mb body limit ran before route 30mb parser; switch resize to JPEG (iOS webp fallback to large PNG); correct 413 messaging; guests 10MB→20MB (injected 2026-05-28)
- [DONE] B15: Reconnect-loop fix — per-tab clientKey (sessionStorage) + server 'displaced'/opened-elsewhere guard so superseded sockets stop instead of looping; verified 2-socket test (injected 2026-05-28)
