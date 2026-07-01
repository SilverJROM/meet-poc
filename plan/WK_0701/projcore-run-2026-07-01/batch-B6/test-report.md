# Batch B6 — Test Report

## Build

| Command | Result |
|---------|--------|
| `cd backend && npm run build` | ✅ PASS |
| `cd frontend && npm run build` | ✅ PASS (pre-existing Stencil empty-glob + MediaPipe CommonJS warnings only) |

## Backend unit tests (targeted)

| Command | Result |
|---------|--------|
| `cd backend && npx vitest run tests/realtime-sfu.test.ts` | ✅ PASS — 7/7 (5 pre-existing + 2 new B6 test-only-route tests) |

New assertions:
- `B6 test-only fault-inject-rules: sets rules at runtime, then clears them` — POST sets a rule, next
  `/api/sfu/tracks` call 406s with `faultInjected: true`; clearing makes the next call reach the (stubbed)
  CF passthrough.
- `B6 test-only fault-inject-rules: disabled (404) when NODE_ENV=production` — route returns 404, proving
  it cannot fire in a shipped build.

## E2E — targeted (isolated ports, real Cloudflare Realtime SFU, `--workers=1`)

Isolated env (does not touch the live PM2 `meet-poc-be`/`meet-poc-fe` on 4700/4720):

```bash
MEET_DB_PATH=/tmp/meet-b6-e2e.sqlite \
MEET_RECORDINGS_DIR=/tmp/meet-b6-recordings \
E2E_BACKEND_PORT=4920 E2E_FRONTEND_PORT=4921 E2E_PROXY_PORT=4910 \
E2E_BASE_URL=http://localhost:4910 E2E_WS_ORIGIN=ws://localhost:4910 \
npm test -w e2e -- e2e/tests/sfu-b6-multiparty-recovery/ --config=playwright.config.ts --workers=1
```

| Test | Result | Timing |
|------|--------|--------|
| B6a: 2-person — subscribe 406 on one direction self-heals to subscribed + advancing inbound audio | ✅ PASS | 13.2s |
| B6b: 5-person — N simultaneous subscribe failures coalesce into ONE rejoin, then fully recover | ✅ PASS | 51.1s |

**2 passed (1.2m total)** — both scenarios pass deterministically; re-run individually and combined
multiple times during development (see Evidence-quality note below).

### R6a evidence (`b6a-two-person-recovery.json`)

- `escalatingEvent`/`recoveredEvent`: real `lastRecoveryEvent` samples off `__meetDebug` — ladder reached
  a coalesced `sfu-rejoin` (epoch 0) while the fault was still active, and subscription/audio recovered
  only after the fault was cleared (no test-only recovery shortcut used).
- `hostInboundAudioBytesAfterRecovery: 5663` — real inbound RTP audio bytes flowing post-recovery
  (not just "subscribed").
- `hostSubscribedCountAfterRecovery: 1` — back to the full expected mid count.
- Screenshot: `screenshots/b6a-recovered.png`.

### R6b evidence (`b6b-rejoin-epochs-during-fault.json`, `b6b-five-person-coalescing.json`)

- `rejoinEpochs` sampled over a 13s window (below the ladder's ≥15s full-rejoin throttle) while 3 guests
  reconnected near-simultaneously: **exactly one** `sfu-rejoin` epoch recorded — 3 simultaneous
  advertised-not-subscribed publishers coalesced into ONE full rejoin, not a storm.
- `hostInboundAudioBytesAfterRecovery: 27245`, `hostSubscribedCountAfterRecovery: 4` — full recovery
  across all 4 peers after the fault was cleared.
- Screenshot: `screenshots/b6b-recovered.png`.

## Regression check (R2–R5, same `__meetDebug` object touched by this batch)

```bash
MEET_DB_PATH=/tmp/meet-b6-e2e.sqlite MEET_RECORDINGS_DIR=/tmp/meet-b6-recordings \
E2E_BACKEND_PORT=4920 E2E_FRONTEND_PORT=4921 E2E_PROXY_PORT=4910 \
E2E_BASE_URL=http://localhost:4910 E2E_WS_ORIGIN=ws://localhost:4910 \
npm test -w e2e -- e2e/tests/sfu-b2b-rejoin-ui/ e2e/tests/sfu-b4-publish-recovery/ e2e/tests/sfu-b5-diagnostics-layer/ --config=playwright.config.ts --workers=1
```

3 passed (15.8s) — B2b rung-4 banner, B4 publish-recovery notice, B5 diagnostics-layer all still green.

## Evidence-quality note (honest account of iteration, per this project's real-recovery-acceptance bar)

Three real issues surfaced and were fixed during development, not swept under a passing re-run:

1. **Test-design bug (not a product bug):** the first fault-rule draft matched on `participantId` alone,
   which also blocked the host's own publish calls (not just subscribes), since `/sfu/tracks` carries
   both under the same endpoint. Fixed by adding `matchLocation: 'local' | 'remote'` to the fault-inject
   rule matcher (see changes.md) and scoping the rule to `matchLocation: 'remote'`.
2. **Test-window bug (not a product bug):** an initial 25s coalescing-observation window in R6b caught a
   *second*, legitimately-throttled `sfu-rejoin` retry at the ~15s mark (the fault was still active, so
   the never-give-up continuation correctly retried) and mis-read it as a coalescing failure. Fixed by
   shrinking the window to 13s (below the ladder's documented ≥15s throttle) so only the initial coalesced
   rejoin is sampled. Verified against real recorded timestamps 15,001ms apart before concluding this was
   correct throttled behavior, not a storm.
3. **Real transient Cloudflare flakiness** (not a bug in this codebase): one 5-person setup run saw
   `[sfu] sessions/new error: fetch failed` and stalled during initial mutual-subscribe under rapid
   real-session creation; a bare re-run passed cleanly. This is the same class of live-network variance
   the existing `sfu-b7-reconnect` suite already budgets generous timeouts for.

No recovery/diagnostics production logic (`sfu-client.service.ts` rungs/coordinator/epoch-guard/coalescing
lock/throttle) was touched to make tests pass — only the fault-injection rule matcher gained a new
optional filter, and `__meetDebug` gained 3 read-only getters.
