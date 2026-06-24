# Autonomous decisions — batch B3b

**Autonomous decisions: none** (beyond approved plan).

Minor implementation choices within locked scope:
- Inline Telegram SVG on login button (ionicons lacks `logoTelegram`).
- `auth.refreshSession()` helper for post-complete cookie adoption.
- Activation `challengeToken` held in component memory during enroll poll (settings reload requires resend).