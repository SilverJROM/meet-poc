# SB1 Changes

## Root Cause

Cloudflare's generated TURN credential response can return `iceServers` as an array of RTC ICE server entries, with STUN URLs in one entry and credentialed TURN URLs in another. The backend normalizer only accepted a single object shape, so an array response was treated as malformed and Cloudflare TURN was dropped entirely. That could remove the TURN-over-TLS/TCP fallback path required for restrictive networks.

## Per-File Why

- `backend/src/modules/ice-config/index.ts`
  - Changed Cloudflare TURN mint handling to normalize either an object response or an array response.
  - Preserves STUN URLs as non-credentialed ICE server entries.
  - Preserves all TURN/TURNS URLs as credentialed ICE server entries, including `turns:...443?transport=tcp` when returned.
  - Keeps the existing TLS 443 fallback derivation when a TLS TURN URL is present but no explicit 443 URL is returned.
  - Caches the full normalized Cloudflare server list instead of a single server.

- `backend/tests/ice-config.test.ts`
  - Updated object-shape coverage to assert STUN is kept without credentials and TURN keeps credentials.
  - Added array-shape coverage matching the documented Cloudflare response, including UDP, TCP, TLS 5349, and TLS 443 TURN URLs.

## Verification

- `cd backend && npm test -- ice-config`
- `cd backend && npm run build`
