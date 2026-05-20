# Batch F (diagf / DR-18/19/21/22) — Projcore Independent Validation

**Verdict: PASS — VERIFIED. Connection resilience delivered. (Also uncovered + fixed a critical live-env leak — see incident below.)**

## Independent execution

| Check | Result |
|---|---|
| Commit | 973dbce (signaling +184: grace records, peer-resumed reconciliation, owner-resume) |
| `npm test -w backend` | 108 passed / 1 skipped |
| DIAGF e2e in isolation | **2/2** (DR-18/19/21 resume-no-ghost + DR-22 grace-recovering) |
| Signaling regression (v2-b8-sidebar S8.1-S8.6: admit/knock/mute/remove/leave) | PASS — F's blast radius clean (incl. explicit-remove → immediate peer-left) |
| Security tests | bogus-token rejected; **stolen-token can't claim another user's reconnecting slot**; owner-by-ownership resume — all pass |
| Data specs after env fix (fixc4/fixc7/fixb2/b8/fixc8) | **24/24** |
| Full Run-1 + all-diag gate (corrected live DB) | **88/89** (1 fail = S4.3 ongoing-tab cross-spec session-isolation flake, passes in isolation, not F) |
| Screenshot | reconnect-no-ghost.png: 2 tiles for 2 people, "guest-resume" resumed into ONE tile, no ghosts (vs original 6-tiles-for-2 bug) |

## Requirement closure

| Req | Status |
|---|---|
| DR-18 silent sticky reconnect (no re-admit) | **VERIFIED** |
| DR-19 no ghost/phantom tiles | **VERIFIED** (peer-resumed reconciliation; explicit-leave still immediate) |
| DR-21 host/owner auto-admit on reconnect | **VERIFIED** (owner-by-ownership test) |
| DR-22 disconnect grace (~20s recovering) | **VERIFIED** (transient recovers without teardown; mobile visibility no longer cleanupCall) |

## 🚨 INCIDENT — leaked test env corrupted the live backend (root cause of this session's validation chaos)

During DIAGF's isolated-DB validation, codex set `MEET_DB_PATH=/tmp/meet-diagf-full.sqlite` + `MEET_RECORDINGS_DIR=/tmp/meet-diagf-full-recordings` then `pm2 restart meet-poc-be` — and **pm2 inherited those env vars**. The LIVE backend was left serving the `/tmp` test DB + writing recordings to `/tmp`. Effects:
- Live app served the wrong DB (JROM's real rooms/recordings/transcripts not served).
- My earlier "cleanups" deleted from the `/tmp` DB (API showed 1 room) while the real `data/meet-poc.sqlite` kept its 83 rooms (CLI view) — the "WAL discrepancy" was actually this DB MISMATCH.
- Recordings written to `/tmp` → S8.7 + FIXB2 "no file" failures.
- Data-seed "FK/WAL flake" → tests' direct-DB helper hit the real file while the backend was on `/tmp`.

**Fix:** `pm2 delete meet-poc-be meet-poc-fe && pm2 start ecosystem.config.js` from a clean shell → restored defaults (`data/meet-poc.sqlite` + repo `recordings/`). Verified: real rooms served, TURN still live (creds in .env via dotenv), recordings dir correct, all 24/24 data specs + 88/89 gate pass.

**HARD RULE for all remaining batches (E2/G/H/I/Z):** codex must NEVER leave the live pm2 service pointed at a test path. After any isolated-DB validation, restart via `pm2 start ecosystem.config.js` with NO `MEET_DB_PATH`/`MEET_RECORDINGS_DIR` exported — OR run the isolated gate against a separate backend instance/port. Projcore verifies pm2 env is clean (only PORT/NODE_ENV) as part of every gate.

## Cleanup

Real DB re-cleaned (the earlier cleanups hit the /tmp DB): now TEST_ROOM01 + JROM Test only.
