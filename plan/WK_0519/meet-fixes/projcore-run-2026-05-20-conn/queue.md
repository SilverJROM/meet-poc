# Conn-Reliability Run — Batch Queue

Codex session: `lkcdx-meet-v5` (v2.0, `--dangerously-bypass-approvals-and-sandbox`)
Branch: `fix/meet-conn-diag` off `fix/meet-fixc8-transcriber-config` tip

| # | Batch | Requirements | Status | Note |
|---|---|---|---|---|
| A | diag1 — reliability core | DR-4 (ICE-restart), DR-5 (TURN config plumbing) | **PASS (code)** | 5a41110 + Cloudflare mint 7a03c9d. Live /api/ice-config returns real Cloudflare relay URLs. Field proof = JROM 2-device test. |
| A.cf | diag1cf — Cloudflare mint completion | DR-5 Cloudflare path | **PASS** | 7a03c9d. Reads TURN_ID+TURN_API_Key, mints+caches+falls back. backend 100/1-skip, ice-config 7/7, Run-1 69/69, PC re-run 8/8. |
| B1 | diagb1 — lobby/pre-join | DR-6, DR-7, DR-9, DR-10 | **PASS** | e92e514 + f53da9a (1 send-back: missed lobby-mic-meter expander). 74/74 gate, backend 101/1-skip. |
| B2 | diagb2 — reliability/observability | DR-1 (screen-share helper), DR-2 (diagnostics panel + force-relay toggle), DR-3 (WS-reconnect) | PENDING | Dispatching next. |

## DR-8 — cross-network asymmetric media (PH↔US)

Same root cause as same-WiFi failure (NAT asymmetry, no relay). Primary fix = DR-5 TURN relay (deployed). **Needs JROM cross-network re-test with relay live.** If it persists: add force-relay (`iceTransportPolicy:'relay'`) diagnostic toggle + DR-2 diagnostics to pin it. Likely no NEW code if relay resolves it; tracked here per JROM request.

## External dependency

TURN credentials from JROM (managed provider — Metered or Cloudflare, pick pending). Batch A builds the plumbing; relay activates when creds are dropped into backend env. Repo stays STUN-only by default.

## Plan-handshake log

- diag1 PROPOSED (codex, 2m14s) → projcore APPROVED-PLAN with 2 amendments (relay-candidate log in Batch A; static-cred path full + Cloudflare-mint stubbed). 2-batch split accepted.
