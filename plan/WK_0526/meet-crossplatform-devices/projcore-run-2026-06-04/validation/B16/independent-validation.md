# B16 — Independent Validation (projcore, verifier≠fixer): relay/ICE robustness B1/N2/B7/B6

**Verdict: SOLID** — committed `4085b43`, master fast-forwarded. Approved with the warn+Retry+Join-anyway amendment (honored).

(Implementer's self-validation preserved in changes.md / review.md; this file is projcore's independent verifier verdict.)

## Diff reviewed (16 files; src scope clean — no B11 transport-recovery or B15 signaling state machine touched)

### B1 — ice-config retry + fail-loud (ice-config.service.ts + ice-config-utils.ts)
- Retry loop 1..`ICE_CONFIG_MAX_ATTEMPTS`(3), driven by pure `decideIceConfigOutcome({fetchOk,hasUsableServers,attempt,maxAttempts}) -> use|retry|relay-unavailable`. Backoff `[250,750]ms`, 5s timeout. ✅
- On exhaustion: sets `relayUnavailable` signal + `lastFetchError`, returns `DEFAULT_ICE_SERVERS` (STUN) — does NOT throw. Correct: keeps a STUN set available for the "Join anyway" path. ✅
- `iceServersFromConfigPayload` normalizes/dedupes and `withTurnTls443Fallback` appends `turns:<host>:443?transport=tcp` when TURN present and not already 443/tcp. ✅ (N2 relay-capability guarantee)

### N2 — doPublish shared iceServers (sfu-client.service.ts, 11 lines)
- Removed hardcoded `[{stun:stun.cloudflare.com:3478}, ...turnServers]`. doPublish PC now built from `await iceConfigService.getIceServers()` (same resolved relay-capable set as the main PC) + `iceTransportPolicy` tracked via `currentIceTransportPolicy='all'`. No hardcoded STUN-only path remains for publish. ✅

### Amendment — warn + Retry + Join anyway (NOT hard-block) (room.page.ts + .html)
- `join()` returns to lobby (state='lobby') when `checkIceConfigForJoin()` returns false — no connect, no hard error. ✅
- `checkIceConfigForJoin()`: if `lastFetchError && !joinAnywayWithStunFallback` → `showRelayUnavailableWarning()` + return false; else proceeds (soft "fallback STUN only, may not connect on restrictive networks" notice). ✅
- `retryRelayConfigForJoin()` (Retry button) → `forceRefresh()`; still unavailable → re-warn; else join. `joinAnywayWithoutRelay()` (Join anyway button) → sets fallback flag → join via STUN. Both buttons present in html under the lobby-warning. ✅ Matches the amendment exactly.

### B7 — diagnostics force-relay (room.page.ts + meeting-sessions.service.ts)
- `forceRelay` now `forceRelayDiagnosticRequested()` (was hardcoded false). `requestedIceTransportPolicy` = 'relay' only when force-relay requested, else 'all'. `selectedCandidatePairType` derived from selected candidate pair local/remote types. `runForceRelayDiagnostics()` exposed via `__meetDebug.forceRelayDiagnostics()` → `checkTurnHealth()`. Normal calls stay 'all'. ✅ Diagnostics-only.

### B6 — backend (ice-config/index.ts)
- `readCloudflareTurn` token now accepts `TURN_API_Key` (first, prod-compat) OR `TURN_API_KEY` (+ existing MEET_/CLOUDFLARE_ vars). New `/api/ice-config/health` → `{turnConfigured, hasTurnServers, configuredSources, acceptedCloudflareTokenEnv}`. No removal of working behavior. ✅

## Proof (re-run independently by projcore)
- frontend `npx tsx ice-config.spec.ts` → "all assertions passed" ✅
- `npx ng build` → green (only pre-existing stencil-glob + mediapipe-ESM warnings) ✅
- backend `npx vitest run tests/ice-config.test.ts` → **14/14** ✅
- DEV: pm2 meet-poc-fe + meet-poc-be restarted by codex; `/api/ice-config/health` reports TURN configured + Cloudflare TURN present.

## Integrity check — the "unrelated backend test drift" claim (verified honest)
Full backend suite shows 8 failures (rooms×3, sessions-ttl×1, signaling-reconnect×1, signaling-waiting-room×1, +2 in full-run pollution). Investigated:
- **signaling-reconnect**: 12/12 in ISOLATION → full-suite parallel pollution only. B15 clean. ✅
- **rooms / sessions-ttl / signaling-waiting-room**: fail in isolation too, BUT at the pre-B15 commit (B14 `ddb27f3`) the SAME files fail MORE (rooms 12-fail vs 3; waiting-room 4-fail vs 1). Neither B15 nor B16 touched rooms/sessions modules. ⇒ **pre-existing, NOT caused by B15/B16.** The specific "promotes closed-room waiters" test was already failing before B15.
- Classified one: rooms S2.1 expects slug `team-sync-{rand6}` but app produces clean `team-sync` (custom-slug feature evolved) ⇒ **stale-test expectation drift**, not an app bug.
- Action: logged to queue as a TEST-HEALTH cleanup (TESTH1) for LEAN1/RETEST1 — a red baseline hides real regressions, so refresh these before the post-fix fan-out. NOT goal-blocking; app is live (24h+ uptime).

## Real-restrictive-network honesty
Real corporate-firewall / UDP-blocked-cellular connect is JROM's seat — fake-media + open-network e2e cannot reproduce a UDP-blocked NAT. The B7 force-relay diagnostic is the closest in-app proof. NOT claimed proven by e2e.
