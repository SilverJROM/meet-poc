# FIX4 Scenarios

## TS-FIX4-001 - STUN-only prior resolution refreshes relay on full-republish recovery

Given a client previously resolved ICE config to STUN-only and `relayUnavailable()` is true, when B11 transport recovery falls back from ICE restart to full republish, then `forceRefresh()` runs once before republish and the rebuilt recovery PC uses the refreshed relay-capable ICE servers.

## TS-FIX4-002 - Relay-capable prior resolution skips redundant refresh

Given a client previously resolved relay-capable ICE servers and `relayUnavailable()` is false, when B11 transport recovery falls back to full republish, then no redundant `forceRefresh()` is called and the republish uses the normal ICE source.

## TS-FIX4-003 - Relay still unavailable does not hard-block recovery

Given a client previously resolved STUN-only and the one forced refresh still returns STUN-only, when full-republish recovery runs, then recovery proceeds with that STUN fallback and does not run an extra fetch loop before rebuilding the PC.

## TS-FIX4-004 - High-latency margins are not loosened

Given a PH-US or similarly high-latency route around 250ms+ RTT, when reviewing the existing SFU margins, then `SFU_HTTP_TIMEOUT_MS=6000`, `SFU_TRANSPORT_DISCONNECTED_GRACE_MS=8000`, `SUBSCRIBE_STUCK_THRESHOLD_MS=10000`, subscribe backoff `250->4000`, and transport recovery backoff `500->2000` remain adequate and unchanged.
