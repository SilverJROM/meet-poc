# Batch A (diag1) — Projcore Independent Validation

**Verdict: PASS (code/test level) — DR-4 fully VERIFIED; DR-5 static path VERIFIED; DR-5 Cloudflare mint deferred to follow-up diag1cf (now dispatched, key provided).**

## Independent test execution

| Gate | Command | Result |
|---|---|---|
| 1 | `git branch` / `git log` | `fix/meet-conn-diag`, commit 5a41110 fix(meet): add ICE config and restart recovery |
| 2 | `npm test -w backend` | **97 passed / 1 skipped** (+4 = ice-config tests vs FIXC8's 93) |
| 3 | Run-1 regression + new diag1 spec | **69/69** PASS in 2.6m (R8.1 → 19 consecutive) |
| 4 | Real-PC specs in the set | fixc3 share-reflow + fixb2 transcript p2p **PASS** — DR-5's `/api/ice-config` fetch-before-PC bootstrap did NOT regress the call path |
| 5 | `.env` safety | gitignored + not tracked; codex added explicit `.env` to `.gitignore` |
| 6 | backend `/api/ice-config` | STUN-only default confirmed (no creds wired yet at Batch A time) |

## On codex's "16 full-suite failures" self-report

Codex reported the FULL unfiltered Playwright run as 109 passed / 16 failed / 5 not-run, claiming failures are out-of-scope/legacy. **Independently substantiated:** those 16 specs are NOT in the agreed Run-1 gate (which is 69/69 clean), and the count is consistent with — actually below — the documented baseline (FIXC1 test-report noted the full unfiltered suite fails ~24/110 due to old B4/B5 local-webserver specs, mobile-audit, missing fixtures). No new regression attributable to Batch A.

## Requirement closure (Batch A scope)

| Req | Status |
|---|---|
| DR-4 — ICE-restart auto-recovery | **VERIFIED** — debounce + cooldown + retry cap + restartIce() + renegotiation over signaling + offer-collision handling; forced-ice-failure e2e passes |
| DR-5 — TURN config plumbing | **VERIFIED (code level)** via diag1cf (commit 7a03c9d): backend `/api/ice-config` live; STUN-only default + static TURN + **Cloudflare mint COMPLETE** (reads JROM's `TURN_ID`+`TURN_API_Key`, mints via credentials/generate ttl 86400, caches to 5min-before-expiry, STUN fallback on failure, dotenv loaded at boot). ice-config tests 7/7. **Live `/api/ice-config` returns real Cloudflare relay URLs** (`turn:turnv2.realtime.cloudflare.com:3478`, `turns:turn.cloudflare.com:5349`) — mint proven with the real key. Field proof (relay clears same-WiFi failure) pending JROM 2-device test. |
| Amendment (relay-candidate log) | **DONE** — getStats selected-candidate-type console log added so relay is confirmable once creds land |

## Notes

- DR-1/DR-2/DR-3 are Batch B (not in this batch).
- The end-to-end relay PROOF (media actually relaying through Cloudflare, same-WiFi "failed" clearing) is pending: (1) diag1cf Cloudflare-mint completion, (2) JROM live test from 2 devices. Until then, DR-5 is code-verified but not field-proven.
- Env var mismatch caught at validation: codex's stub read `CLOUDFLARE_TURN_*`; JROM's `.env` uses `TURN_ID` + `TURN_API_Key`. diag1cf brief instructs codex to read JROM's exact names.

## Pending before Batch A → fully VERIFIED

- diag1cf: Cloudflare mint completion (dispatched).
- JROM live 2-device test confirming `selected candidate: relay` + cleared failure.
