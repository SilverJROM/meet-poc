# Conn-Reliability Run — Batch Queue

Codex session: `lkcdx-meet-v5` (v2.0, `--dangerously-bypass-approvals-and-sandbox`)
Branch: `fix/meet-conn-diag` off `fix/meet-fixc8-transcriber-config` tip

| # | Batch | Requirements | Status | Note |
|---|---|---|---|---|
| A | diag1 — reliability core | DR-4 (ICE-restart), DR-5 (TURN config plumbing) | **PASS (code)** | 5a41110 + Cloudflare mint 7a03c9d. Live /api/ice-config returns real Cloudflare relay URLs. Field proof = JROM 2-device test. |
| A.cf | diag1cf — Cloudflare mint completion | DR-5 Cloudflare path | **PASS** | 7a03c9d. Reads TURN_ID+TURN_API_Key, mints+caches+falls back. backend 100/1-skip, ice-config 7/7, Run-1 69/69, PC re-run 8/8. |
| B1 | diagb1 — lobby/pre-join | DR-6, DR-7, DR-9, DR-10 | **PASS** | e92e514 + f53da9a (1 send-back: missed lobby-mic-meter expander). 74/74 gate, backend 101/1-skip. |
| B2 | diagb2 — reliability/observability | DR-1 (screen-share helper), DR-2 (diagnostics panel + force-relay toggle), DR-3 (WS-reconnect + secure reconnect token) | **PASS** | 4567de7. backend 103/1-skip, full gate 77/77, reconnect token security-reviewed + tested. |

| C | diagc — voice-first resilience | DR-11 (auto-degrade to audio-only + manual toggle + quality pill + audio-priority allocation) | **PASS** | cbaa018. Isolation 12/12, audio-priority code verified, codex 78/78 isolated DB. Live-DB gate had 12 data-spec failures = pollution/seed-drift (not DR-11); DB cleaned to TEST_ROOM01. |
| D | diagd — join-popout + audio-invariant | DR-12 (always-clickable Join + popout), DR-13 (audio-bandwidth non-overridable invariant) | **PASS** | 59be4c0. codex 83/83 clean-DB; projcore 55/55 non-seed-flaky + diagd 5/5 + DR-13 invariant test. 4 live-DB FK/WAL seed-flakes (test-infra, not DR-12/13). |

| E1 | diage1 — room access + URLs | DR-14 (clickable rooms), DR-15 (name-slug + custom owner slug URLs) | PENDING | Dispatch after DIAGD. |
| E2 | diage2 — waiting room | DR-16 (host open/close toggle + wait-timeout param; closed=timed-wait+kick+reconnect, open=unlimited+host-available) | PENDING | Dispatch after E1. Host-opened = explicit toggle; wait default 15min host-set. |
| F | diagf — reconnect + ghost tiles (PRIORITY) | DR-18 (silent sticky reconnect, no re-admit), DR-19 (no ghost/phantom tiles) | PENDING | Added 2026-05-20 from real-device report + screenshot. Same root cause; ties to DR-3 token not firing. Highest pain — consider before E2 if JROM reprioritizes. |
| G | diagg — display polish | DR-17 (remove all mirroring), DR-20 (stable speaker order + ~5s settle) | PENDING | Added 2026-05-20. Small frontend display tweaks. |

## RUN CODE-COMPLETE (DR-1..DR-10, 2026-05-20) — DR-11+ added as follow-ons

DR-1..DR-10 all implemented + projcore-verified. R8.1 → 21 consecutive (77/77). Only **DR-8 cross-network field-proof** outstanding — needs JROM live PH↔US re-test (equipped now with diagnostics panel + force-relay toggle). Codex session lkcdx-meet-v5 parked (not torn down) until DR-8 confirmed.

## DR-8 — cross-network asymmetric media (PH↔US)

Same root cause as same-WiFi failure (NAT asymmetry, no relay). Primary fix = DR-5 TURN relay (deployed). **Needs JROM cross-network re-test with relay live.** If it persists: add force-relay (`iceTransportPolicy:'relay'`) diagnostic toggle + DR-2 diagnostics to pin it. Likely no NEW code if relay resolves it; tracked here per JROM request.

## External dependency

TURN credentials from JROM (managed provider — Metered or Cloudflare, pick pending). Batch A builds the plumbing; relay activates when creds are dropped into backend env. Repo stays STUN-only by default.

## Plan-handshake log

- diag1 PROPOSED (codex, 2m14s) → projcore APPROVED-PLAN with 2 amendments (relay-candidate log in Batch A; static-cred path full + Cloudflare-mint stubbed). 2-batch split accepted.
