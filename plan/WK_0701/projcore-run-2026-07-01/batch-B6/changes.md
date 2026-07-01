# Batch B6 — Changes

## Root cause (of the two infra gaps, not a product bug)

R6's local capstone needed to inject a subscribe failure on a *specific* participant, live, against a
real Cloudflare SFU session, and then prove the already-shipped R2–R5 recovery ladder self-heals. Two
gaps blocked this:

1. `SFU_FAULT_INJECT_RULES` is env-only, read once at backend process start (`parseSfuFaultInjectRules`).
   The e2e webServer is one shared long-running process for the whole test file, so a rule can't be
   targeted to a specific runtime-generated `participantId` — there was no way to set/clear fault rules
   against an already-running process.
2. The recovery-ladder signals needed to *prove* real self-heal (`lastRecoveryEvent`, `sfuRejoinThrottled`,
   `publishRecoveryFailed`) existed as public signals on `SfuClientService` but weren't exposed on
   `window.__meetDebug` — only `sfuSubscribedTracks`/`sfuPublishState`/`sfuGetStats` were.

Both fixes are additive test-harness infra (no recovery/diagnostics production logic touched).

## Code changes

### `backend/src/modules/realtime-sfu/sfu-fault-inject.ts`
- Extracted `sanitizeSfuFaultInjectRules(parsed: unknown)` out of `parseSfuFaultInjectRules()` (same
  validation, now reusable from an HTTP body, not just an env-var JSON string).
- Added optional `matchLocation?: 'local' | 'remote'` to `SfuFaultInjectRule` + `ruleMatches()`. The
  `/sfu/tracks` endpoint carries both local (own-publish) and remote (subscribe) track-new calls,
  distinguished per-entry by `location`; without this, a participant-scoped rule also broke that
  participant's own publish, not just its subscribes (caught by a real test run — see Nail-points below).

### `backend/src/modules/realtime-sfu/index.ts`
- New `POST /api/sfu/test-only/fault-inject-rules` route, gated `NODE_ENV !== 'production'` (404
  otherwise) — same guard convention as `SFU_FAULT_INJECT` itself. Calls the existing
  `setSfuFaultInjectRulesForTests`/`clearSfuFaultInjectForTests` (previously only reachable in-process
  from a Vitest test) so a running Playwright e2e test can target/clear rules live.

### `frontend/src/app/pages/room/room.page.ts`
- 3 read-only `__meetDebug` getters: `sfuLastRecoveryEvent`, `sfuRejoinThrottled`,
  `sfuPublishRecoveryFailed` — each a one-line passthrough to the existing public `SfuClientService`
  signal (mirrors the existing `sfuSubscribedTracks` pattern). No behavior change.
- Type declaration for `window.__meetDebug` updated to match.

### `backend/tests/realtime-sfu.test.ts`
- 2 new tests: the test-only route sets rules at runtime (subsequent `/sfu/tracks` call 406s, then a
  clear makes it pass through to CF again) and is disabled (404) when `NODE_ENV=production`.

### `e2e/tests/sfu-b6-multiparty-recovery/` (new)
- `helpers.ts` — join-N-clients (host + guestCount guests, audio-only, mutually subscribed), fault-rule
  set/clear via the new route, recovery-event/inbound-audio-bytes polling helpers. No shared join-N
  fixture existed before this batch (every prior SFU e2e hand-rolls its own 2-client setup).
- `sfu-b6a-two-person-recovery.spec.ts` — R6a.
- `sfu-b6b-five-person-coalescing.spec.ts` — R6b.

## Fault-targeting mechanism (why no video, why no `matchTrackName`)

`matchSfuFaultInject` matches on the **caller's own** `participantId` (the subscriber issuing the
request), never the remote publisher's. Audio-only join (no camera) keeps mid-counts simple (1 mid per
remote peer instead of 2). A rule of `{endpoint:'tracks', matchParticipantId: <subscriber>,
matchLocation:'remote', status:406}` blocks exactly that subscriber's subscribe-to-anyone calls without
needing to predict a not-yet-generated post-reconnect track name.

## Out of scope (unchanged)

- No changes to `sfu-client.service.ts` recovery-ladder logic (rungs, coordinator, epoch guard,
  coalescing lock, throttle) — R2–R5 stand as validated.
- No changes to the existing `/sfu/tracks` production 406/error-passthrough behavior for real Cloudflare
  errors — the new route only feeds the pre-existing test-override path.
