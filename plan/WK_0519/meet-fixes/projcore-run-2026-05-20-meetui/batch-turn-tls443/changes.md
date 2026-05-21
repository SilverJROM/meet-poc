# Batch TURN-TLS443 Changes

User Report verbatim:
> SECONDARY insurance (DR-34 already shipped is the likely real fix): ensure media can relay on networks that block UDP + all non-443 ports. INVESTIGATE FIRST: backend/src/modules/ice-config/index.ts forwards whatever Cloudflare's mint returns + supports a static TURN env + Google STUN. Find out what Cloudflare actually returns (the iceServers.urls array — does it already include a turns:…:5349 TLS entry? a :443 entry?). Then ensure the delivered ICE config includes a TURN-over-TLS entry usable on restrictive nets (turns:…?transport=tcp on 443 IF Cloudflare supports it; else make the static-env path the documented way + don't inject a dead 443 URL that just slows ICE gathering). Keep existing STUN/UDP/TURN entries (443/TLS is the fallback, not a replacement). Backend-only, minimal, guarded. Don't change reconnect/audio/diagnostics/mint-auth; don't regress DR-1..35.

Root Cause mechanism:
The app used Cloudflare's `/credentials/generate` mint response as-is. Live inspection showed that endpoint returns STUN, TURN UDP/TCP 3478, and TURN/TLS 5349, but not TURN/TLS 443. Cloudflare's current Realtime TURN docs and `generate-ice-servers` response confirm `turns:turn.cloudflare.com:443?transport=tcp` is supported as the TLS alternate port for restrictive networks.

Cloudflare returned:
- `/credentials/generate`: `stun:stun.cloudflare.com:3478`, `turn:turnv2.realtime.cloudflare.com:3478?transport=udp`, `turn:turn.cloudflare.com:3478?transport=tcp`, `turns:turn.cloudflare.com:5349?transport=tcp`.
- `/credentials/generate-ice-servers`: includes `turns:turn.cloudflare.com:443?transport=tcp` in the credentialed TURN entry.

Per-file WHY:
- `backend/src/modules/ice-config/index.ts`: adds a guarded `turns:<same-host>:443?transport=tcp` URL to the same Cloudflare credential entry only when Cloudflare returned a parseable `turns:` host and did not already return a TLS 443 URL. Existing Google STUN, static TURN env, Cloudflare UDP/TCP/5349 URLs, mint endpoint, cache, and failure fallback are unchanged.
- `backend/tests/ice-config.test.ts`: covers the mocked Cloudflare mint response, same-entry credentialed TLS 443 derivation, dedupe, malformed URL guard, non-TLS no-derive behavior, static TURN env, and incomplete env fallback.

Caveats / deferred:
- Static `MEET_TURN_URLS` remains the operator route for non-Cloudflare TURN/TLS 443 providers.
- No frontend, reconnect, audio playback, diagnostics capture, or mint-auth behavior changed.
