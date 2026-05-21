# Batch TURN-TLS443 Independent Validation

DR-36 result: VERIFIED locally.

Validation checks:
- Cloudflare `/credentials/generate` live inspection found no TLS 443 in the existing code path.
- Cloudflare current docs and live `generate-ice-servers` inspection confirm `turns:turn.cloudflare.com:443?transport=tcp` is supported.
- Code appends the 443 fallback to the same credentialed Cloudflare entry, not as an uncredentialed standalone ICE server.
- Code derives only from parseable `turns:` URLs and dedupes existing explicit TLS 443.
- Static TURN env remains the operator-controlled path for non-Cloudflare 443 TURN.
- Targeted ICE config tests, backend build, repo build, and full backend tests passed.
- pm2 restart completed and no `/tmp` test env leaked into live pm2.

Residual risk:
- Real restrictive-network validation still requires an environment that blocks UDP and non-443 outbound traffic.
