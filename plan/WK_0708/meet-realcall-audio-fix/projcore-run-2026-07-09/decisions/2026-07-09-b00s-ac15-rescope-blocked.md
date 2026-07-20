# Decision — B00S-AC15-RESCOPE blocked (autonomous, 2026-07-09)

**Source:** projcore (not JROM)
**Status:** BLOCKED / REVISE — do not promote AC15 to full VERIFIED

## Facts

1. Impl commit `7a59d97` added `e2e/harness/__tests__/b00s-ac15-rescope.browser.test.ts`.
2. Test is **defective** under B00S-DEVICE contract:
   - sets `deviceMode: 'real-virtual-mic'`
   - also passes `launchArgs: [--use-file-for-fake-audio-capture=…]` — **forbidden** (call-driver throws on sneaked fake flags).
3. Coord host is **192.168.254.140** (`minisserver`). `real-virtual-mic` requires **192.168.254.123** (`jromhost`, PipeWire/pactl present). Host gate would fail even with flags fixed.
4. `.123` is SSH-reachable as `silverjrom@192.168.254.123` but **has no meet-poc checkout** — cannot run the browser harness there yet.
5. Local app stack incomplete for live dual-browser:
   - PID on `:4700` is raw backend (`backend/src/server.ts`, PORT=4700) — `/login` 404
   - PM2 `meet-poc-be` / `meet-poc-fe` not running
   - `:4200` / `:4711` / `:4720` down
6. Progress line claiming validation start at 11:44 was **premature** — no vitest process, no evidence dir, frontend down.
7. Zombie `x-01_impl_sonnet_meet` stuck on permission prompt for callbacks.md edit — killed 12:12 UTC.

## Decision

- Mark **B00S-AC15-RESCOPE = BLOCKED** (not VERIFIED). AC15 remains **SCOPED** (instrument/fake-device).
- Do **not** stand idle waiting for app: next batch is **B00S-BUDGET** (ledger pollution is live risk — root `callBurnCount=58`, e2e=49, dual ledger files).
- AC15-RESCOPE re-open requires a follow-up batch that:
  1. Fixes test: real-virtual-mic **without** fake capture flags; speech via OS virtual mic / paplay path.
  2. Runs on `.123` (sync repo + chromium + app or remote-drive) OR documents asymmetric topology if only one leg is real-mic.
  3. Brings proper consolidated app (`pm2` meet-poc-be@4720 + fe proxy@4700, or e2e-webserver with BASE_URL match).

## Not a JROM stop

Ops path is known; budget hygiene unblocks safe AC burns. Escalate only if `.123` access/policy changes.
