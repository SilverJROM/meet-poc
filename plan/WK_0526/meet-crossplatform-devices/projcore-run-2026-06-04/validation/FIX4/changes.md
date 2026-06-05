# FIX4 Changes

## Branch

`feat/crossplatform-devices-20260604` at base `716af7e`. No commit per 3-agent instruction.

## User Report

"JROM requested international (PH to US) hardening: re-fetch ice-config (relay) on transport recovery so a client that joined STUN-only because relay was momentarily down picks up a now-available TURN relay when the link later degrades on a restrictive/international network; verify high-latency margins and only bump if genuinely tight."

## Root Cause

`SfuClientService.recoverTransport()` tried ICE restart first and then delegated full republish to the room handler. The full republish path rebuilt the PC through `doPublish()`, whose ICE source was the normal `getIceServers()` path. If the last resolution had fallen back to STUN-only with `relayUnavailable=true`, recovery did not explicitly force a fresh TURN resolution before rebuilding the PC.

Addendum teardown hygiene: independent validation found the new one-shot `recoveryPublishIceServers` field was consumed by publish but not cleared by call-exit teardown. A hangup/destroy after setting the field but before `consumePublishIceServers()` could have left stale recovery ICE for the next call on the root service singleton.

## Refetch Design

- Trigger condition: `this.iceConfigService.relayUnavailable()` only. This represents the prior STUN-only / relay-unavailable resolution.
- Location: `recoverTransport()` after ICE restart fails and before `resetForTransportRecovery()` plus the full-republish handler.
- Source handoff: the single `forceRefresh()` result is stored as one-shot `recoveryPublishIceServers`; `doPublish()` consumes it once via `consumePublishIceServers()`.
- Outcome: if TURN is now available, the recovery PC is created with relay-capable ICE servers. If TURN is still unavailable and the forced refresh returns STUN fallback, the recovery PC is still created with STUN and recovery is not hard-blocked.
- Bound: one forced refresh per full-republish recovery attempt, only when prior resolution was relay-unavailable. Prior relay-capable clients use the normal source and do not pay a refresh.

## Margin Verdict

No constants changed. The current values are adequate for 250ms+ RTT:

- `SFU_HTTP_TIMEOUT_MS=6000`: covers multiple 250ms RTTs plus Cloudflare/API processing margin.
- `SFU_TRANSPORT_DISCONNECTED_GRACE_MS=8000`: avoids premature recovery on transient international jitter while still bounded.
- `SUBSCRIBE_STUCK_THRESHOLD_MS=10000`: gives enough time for SFU subscribe/renegotiate/ontrack on slow paths before retry.
- Subscribe retry backoff `250->4000` and transport recovery backoff `500->2000`: bounded and patient enough for degraded links without adding long dead time.

## Code Changes

- `frontend/src/app/services/sfu-client.service.ts` - Added one-shot recovery ICE source populated by `forceRefresh()` only when `relayUnavailable()` is true before full-republish transport recovery; `doPublish()` consumes that source once before falling back to normal `getIceServers()`.
- `frontend/src/app/services/sfu-client.service.ts` - Addendum: cleared pending `recoveryPublishIceServers` in `closeLiveTracksForExit()` and `destroy()` so teardown cannot leak a stale one-shot ICE source into the next call.
- `frontend/src/app/services/sfu-client.spec.ts` - Added recovery republish PC-config assertions for STUN-only prior state, relay-capable prior state, refetch-still-STUN fallback, and teardown clearing of the pending one-shot recovery ICE source.

## No B11 State Machine Change

No changes were made to `planSfuTransportRecovery`, transport recovery flags, disconnected grace, attempt cap, guards, or backoff constants. The change only alters the ICE server source used by the full-republish recovery PC.

## Verification

- PASS: `npx tsx src/app/services/sfu-client.spec.ts`
- PASS: `npx tsx src/app/services/ice-config.spec.ts`
- PASS: `npx tsc -p tsconfig.app.json --noEmit`
- PASS: `npx tsc -p tsconfig.spec.json --noEmit`
- PASS: `npm run build -w frontend`
- PASS: `pm2 restart meet-poc-fe`
- PASS: `curl -fsSI http://localhost:4700/login`
- PASS: `curl -fsS http://localhost:4720/health`
- PASS: `curl -fsS http://localhost:4720/api/ice-config` returned TURN/TURNS-capable ICE config.

Addendum rerun:

- PASS: `npx tsx src/app/services/sfu-client.spec.ts`
- PASS: `npx tsc -p tsconfig.app.json --noEmit`
- PASS: `npx tsc -p tsconfig.spec.json --noEmit`
- PASS: `npm run build -w frontend`
- PASS: `pm2 restart meet-poc-fe`

## Caveats

- Real PH-US restrictive-link recovery was not reproduced locally. The unit spec proves the recovery refetch wiring and recovery-PC ICE source; live field proof remains a manual/JROM-seat validation item from the brief.
