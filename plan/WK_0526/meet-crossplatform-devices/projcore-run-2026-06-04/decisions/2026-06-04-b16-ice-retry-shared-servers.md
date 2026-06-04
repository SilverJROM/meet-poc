# B16 ICE Retry And Shared Servers

## Decision

Use 3 total `/api/ice-config` attempts with the existing 5s request timeout and short backoffs of 250ms then 750ms. On exhaustion, return explicit fallback STUN state and require the lobby warning to offer Retry and Join anyway.

## Rationale

Three attempts catches transient backend/network blips without creating a long join delay. The amendment requires open-network users to keep an escape hatch, while restrictive-network users get a clear relay-unavailable warning and retry path.

## Shared ICE Strategy

Move the pure payload mapper to `ice-config-utils.ts`, re-export it from `ice-config.service.ts`, and make SFU publish consume `IceConfigService.getIceServers()` directly. This keeps publish and main/subscribe transport on the same relay-capable server set and makes the mapper unit-testable without Angular JIT.
