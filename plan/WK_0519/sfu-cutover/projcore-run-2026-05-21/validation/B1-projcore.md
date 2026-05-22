# projcore gate — B1 (SR-1) — PASS
Commit: 59c0122 on feat/sfu-cutover. Codex: VALIDATED-PASS (validation-B1-codex.md).
7-gate: artifacts✓ diff✓(realtime-sfu/index.ts 236L + server.ts +2 wiring + test 115L; clean scope) build✓ tests✓(3/3, incl real CF smoke → creds valid + reachable) evidence✓(token-leak asserted absent, authz+ownership+error-passthrough+503 covered) req✓(SR-1 VERIFIED) standing-rules✓.
Note: process-local ownership map is fine for B1; reconnect/persistence deferred to B7. Real CF smoke PASS confirms SFU_APP_ID/SFU_TOKEN work against Cloudflare Realtime.
VERDICT: PASS. SR-1 VERIFIED. Advance to B2 (publish + operation queue).
