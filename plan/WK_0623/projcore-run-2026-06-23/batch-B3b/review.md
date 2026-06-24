# Batch B3b — Self-review

## Requirements

| Req | Coverage |
|-----|----------|
| R3.5 | Login TG icon; email-first; ineligible message; number + poll + complete |
| R3.6 | Settings always-shown toggle; enroll/test/activate/disable |
| R3.9 | Password login form untouched |

## Notes

- B3a shipped `start/status/complete` only; activation routes added minimally in same batch (no duplication).
- No Turnstile widget on login yet; empty token works in dev (`CF_TURNSTILE_SECRET` unset). Prod needs site key widget follow-up.
- Inline Telegram SVG used (ionicons has no `logoTelegram` export).

## Risks accepted

- Settings page reload during pending enrollment loses `challengeToken` in memory; user can resend test via Enable button.