# Decision: Cloudflare TURN TLS 443 Fallback

Date: 2026-05-21
Batch: turn-tls443
Requirement: DR-36
Type: autonomous-call

Decision:
Derive `turns:<same-host>:443?transport=tcp` from Cloudflare's existing minted `turns:` host when the `/credentials/generate` response lacks an explicit TLS 443 URL.

Reasoning:
- Live `/credentials/generate` inspection returned TLS 5349 but no TLS 443.
- Cloudflare's current Realtime TURN documentation lists TURN over TLS on `turn.cloudflare.com` with primary `5349/tcp` and alternate `443/tcp`.
- Live `/credentials/generate-ice-servers` inspection returned `turns:turn.cloudflare.com:443?transport=tcp` in the credentialed TURN entry.
- Adding the URL to the same credential entry avoids an unusable uncredentialed TURN candidate.
- Deriving only from an existing `turns:` host avoids inventing TLS candidates from plain TURN hosts.

Guardrails:
- Do not add a duplicate if Cloudflare already returns explicit TLS 443.
- Do not derive from malformed URLs or plain `turn:` URLs.
- Preserve existing STUN, UDP/TCP 3478, TLS 5349, static TURN env, and failure fallback behavior.
