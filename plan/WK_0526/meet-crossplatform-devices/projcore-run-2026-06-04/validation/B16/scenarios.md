# B16 Scenarios

## Covered

- B1: `/api/ice-config` succeeds on first attempt -> resolved ICE servers are used and cached.
- B1: transient `/api/ice-config` failure before max attempts -> retry decision is `retry` with 250ms then 750ms backoff.
- B1: exhausted fetch/unusable payload at attempt 3 -> outcome is `relay-unavailable`; app exposes relay warning, with Retry and Join anyway actions.
- B1 amendment: Join anyway proceeds with explicit fallback STUN warning instead of hard-blocking open-network users.
- N2: publish PC uses the shared resolved ICE server list from `IceConfigService`; no hardcoded publish-only STUN prepend remains.
- B7: diagnostics payload records requested ICE transport policy, selected candidate-pair type, and a force-relay diagnostic result when triggered.
- B6: backend accepts both `TURN_API_Key` and `TURN_API_KEY`; `/api/ice-config/health` reports TURN configured state.

## Not Proved Here

- Real restrictive-network connection through a corporate firewall or UDP-blocked NAT is JROM's seat. Fake-media/open-network tests cannot prove that environment.
