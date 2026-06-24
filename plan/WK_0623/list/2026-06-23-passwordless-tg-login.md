---
date: 2026-06-23
type: feature
status: planned (implementation gated behind JROM post-call go)
agent: projcore
qa_verification: pending
---

# Passwordless Telegram login (number-matching)

## JROM verbatim
> "fix on the login screen to be able to login via telegram ... a telegram icon on the login, and clicking
> shows a number on screen and pushes that number on screen with 2 other numbers on the telegram of the
> user and clicking that with acknowledgement and delete previous message logs in the user without a
> password. ofcourse this only happens when the telegram is already linked and activated on the user
> settings, otherwise clicking it says must activate passwordless login on app. this has already been done
> by lokalcamp, you can just ask for more details ... on the agent inside 'lokal' session"

## Disposition
Designed in `projcore-run-2026-06-23/` (north-star Issue #3, decision
`2026-06-23-passwordless-telegram-login.md`, req-matrix R3.1–R3.10, plan `B3-passwordless-tg-login.md`).
Pattern lifted from lokalcamp R9 — **code-verified** by the lokal-session agent (read from lokalcamp source,
not memory): constant-time eligibility, deferred anti-enum send, 3-button number-match, atomic single-use
challenge, one-wrong-tap-kills, secret-token webhook + from.id anti-spoof, test-before-activate. Translated
from CF-Workers/D1/GraphQL → meet-poc Express/SQLite/REST; callback prefix `vlk:`. Biggest unknown =
whether meet-poc already ingests Telegram webhook callback_query (B3-T0 spike). No implementation until go.
