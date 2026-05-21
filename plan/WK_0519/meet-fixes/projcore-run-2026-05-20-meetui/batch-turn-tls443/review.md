# Batch TURN-TLS443 Review

Scope review:
- Backend-only change in the ICE config module.
- The derived TLS 443 URL is added to the same Cloudflare `iceServers` entry that carries Cloudflare's `username` and `credential`.
- Derivation only uses an existing parseable `turns:` URL as the source. Plain `turn:` hosts never produce a TLS 443 candidate.
- Dedupe checks for an existing explicit `turns:` port 443 before adding a fallback.
- Malformed TURN URLs are preserved as returned by Cloudflare but are not used as derivation sources.

Regression review:
- Google STUN remains first.
- Static TURN env is still returned exactly when complete and ignored when incomplete.
- Existing Cloudflare UDP/TCP/5349 entries remain in order; TLS 443 is appended as fallback.
- Cloudflare mint URL, auth headers, TTL, cache, and failure behavior are unchanged.

Risk notes:
- The derived URL assumes the host from Cloudflare's existing TLS TURN URL supports the documented alternate TLS port 443. This is backed by Cloudflare's current Realtime TURN docs and live `generate-ice-servers` response.
