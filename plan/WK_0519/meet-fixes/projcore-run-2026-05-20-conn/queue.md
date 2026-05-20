# Conn-Reliability Run — Batch Queue

Codex session: `lkcdx-meet-v5` (v2.0, `--dangerously-bypass-approvals-and-sandbox`)
Branch: `fix/meet-conn-diag` off `fix/meet-fixc8-transcriber-config` tip

| # | Batch | Requirements | Status | Note |
|---|---|---|---|---|
| A | diag1 — reliability core | DR-4 (ICE-restart), DR-5 (TURN config plumbing) | **PASS (code)** | 5a41110 + Cloudflare mint 7a03c9d. Live /api/ice-config returns real Cloudflare relay URLs. Field proof = JROM 2-device test. |
| A.cf | diag1cf — Cloudflare mint completion | DR-5 Cloudflare path | **PASS** | 7a03c9d. Reads TURN_ID+TURN_API_Key, mints+caches+falls back. backend 100/1-skip, ice-config 7/7, Run-1 69/69, PC re-run 8/8. |
| B | diag2 — UX + observability + pre-join | DR-1 (screen-share helper), DR-2 (diagnostics panel), DR-3 (WS-reconnect), DR-6 (minimal quick-join, self-preview), **DR-7 (pre-join validation + clear errors)** | PENDING | Next dispatch. DR-6 + DR-7 added 2026-05-20. DR-6/DR-7 share the pre-join surface. |

## External dependency

TURN credentials from JROM (managed provider — Metered or Cloudflare, pick pending). Batch A builds the plumbing; relay activates when creds are dropped into backend env. Repo stays STUN-only by default.

## Plan-handshake log

- diag1 PROPOSED (codex, 2m14s) → projcore APPROVED-PLAN with 2 amendments (relay-candidate log in Batch A; static-cred path full + Cloudflare-mint stubbed). 2-batch split accepted.
