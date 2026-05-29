Batch SB1 — ICE/TURN reliability: TURN over TLS/TCP + never force relay

You are the IMPLEMENTER (codex gpt-5.5). Claude /projcore supervises from session `lkvc`. NOT a coordinator role.

Requirements (verbatim from og-requirements.md):
- SR1: `/api/ice-config` must expose a TURN-over-TLS/TCP relay path (the firewall-traversal path Cloudflare returns, e.g. `turns:…?transport=tcp` on the TLS port) so users behind restrictive/corporate/mobile NAT always have a working path to the SFU. Relay must remain a FALLBACK, not forced.
- SR2: the client must NEVER force TURN relay — `iceTransportPolicy` must be `'all'` (or unset), so host/srflx win when viable and relay is fallback only.

Lifecycle: pre-live, deferral OFF. No TODO/stubs.

Likely files:
- backend/src/modules/ice-config/index.ts (Cloudflare TURN minting via /v1/turn/keys/<id>/credentials/generate; STUN; static TURN)
- frontend/src/app/services/sfu-client.service.ts (RTCPeerConnection construction) + wherever iceServers are applied
- frontend ice-config consumer (ice-config.service.ts)

Scope guards (MANDATORY):
- Surgical. Do NOT touch publish/subscribe, screen-share, reconnect, or recording logic.
- No mesh/P2P. No forcing relay anywhere.
- Verify the ACTUAL Cloudflare TURN `/credentials/generate` response shape (it returns an iceServers object with multiple `urls` incl. udp/tcp/tls). Ensure ALL returned urls (especially the TLS/TCP one) are forwarded to the client — not collapsed to a single udp url.
- Do not hardcode TURN creds; keep env-driven.

Plan handshake (MANDATORY before code):
1. Read this brief + the files. Diagnose mechanism: does the current code drop the TLS/TCP TURN url? Is iceTransportPolicy set anywhere? 
2. Reply with PROPOSED approach: files to change + exact mechanism + how SR1/SR2 will be observable (e.g. `curl /api/ice-config` shows a turns/tcp entry; grep shows iceTransportPolicy 'all'/unset). 
3. End reply: `STATUS: PROPOSED — <one-line>`. Wait for APPROVED-PLAN before editing.

After APPROVED-PLAN: implement, `cd backend && npm run build`, then write `STATUS: DONE — <one-line>` (callback FIRST to <run>/callbacks.md).

Write artifacts under plan/WK_0526/sfu-optimization/projcore-run-2026-05-28/: SB1-changes.md (root cause + per-file why), and append callbacks to callbacks.md.
