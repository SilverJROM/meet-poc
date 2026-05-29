## Accepted: SB1 — STATUS: PASS
Branch: feat/share-persistence-mobile-revoke-20260528 (working tree; not committed)
Implemented: backend ice-config normalizer now handles Cloudflare iceServers as object OR array, preserving STUN (no creds) + all TURN/TURNS urls incl turns:443?transport=tcp / 5349?tcp, creds on TURN only.
Req#s closed: SR1, SR2 (VERIFIED).
Key finding: pre-fix, Cloudflare's array response was dropped → production had NO Cloudflare TURN relay (only Google STUN). Now fixed — restrictive-network users get a TLS/TCP relay path. Backend runs via tsx-watch (already serving the fix; verified by live curl).
Open in matrix: SR3 (SB2), SR4 (SB3).
Gotchas: media PC must stay policy-unset ('all'); the only forced-relay is the diagnostic TURN health probe (keep it).

## Next: SB2 — connection-route detector (SR3)
getStats already reads candidate-pair (relayUsed, candidate types, RTT) in sfu-client.service.ts (~line 165-230). Diagnostics pipeline already writes relay_used/candidate_types to meeting_session_diagnostics. SB2 surfaces a per-user quality classification (direct vs relay + RTT/loss band) as an in-call chip + log/alert when stuck on relay or sustained-degraded.

## Accepted: SB2 — STATUS: PASS
Implemented: local SFU connection-quality sampler (sfu-client.collectConnectionQuality, 5s), controls-bar chip (Good/Fair/Relayed/Poor), episode-throttled relay+poor alerts (3 samples≈15s, reset on recovery), additive sfuDiagnostics.connectionQuality.
Req#s closed: SR3 (VERIFIED at code+build; live degraded/relay state observable in a real bad-network call).
Open in matrix: SR4 (SB3).
For SB3: the quality signal lives at sfuClient.connectionQuality()/collectConnectionQuality() — SB3 (adaptive simulcast) should drive subscriber RID selection off THIS signal. Existing simulcast: 3 layers h/m/l in sfu-client; preferred RID already varies by mobile/screen-share/peer-count. Extend with quality-band input.
