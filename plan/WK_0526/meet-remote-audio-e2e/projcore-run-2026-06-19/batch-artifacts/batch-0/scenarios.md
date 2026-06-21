# B0 Scenarios — DEV up + local 2-client rig + measurement

## Acceptance (from brief + og-requirements R1 + measurement standard)
- DEV (PM2 meet-poc-be + fe) is up: health 200, /login 200, host can create/open throwaway room.
- Reusable rig (audio-rig.ts) creates dedicated throwaway (RA-E2E-* prefix, never TEST_ROOM01).
- Measurement module (shared, page-injectable): given remote inbound track + getStats, returns metrics; PASS = energyAboveFloorMs >= 3000 AND inboundBytesDelta > 0.
- Two local clients (distinct WAVs: 440Hz host, 880Hz guest) join via knock→admit.
- Mutual audio proven on rendered app: host measures guest PASS + guest measures host PASS.
- 2-tile in-call screenshot + JSON metrics artifact.
- Exact join/admit path documented (from live inspection).

## Steps exercised
1. pm2 start + seed → DEV green.
2. createThrowaway + launch with --use-file-for-fake-audio-capture (distinct).
3. Host: login → lobby preflight drive (Test speaker + Yes + confirm) → Join → .call-panel.
4. Guest: name/ask → preflight drive → Ask to join → knocking text.
5. Host admits using inspected real selector (.knock-toast .primary-btn Admit).
6. Both in-call (2 tiles).
7. measureInboundAudio (analyser RMS window + sfu inbound-rtp bytes) on each side → both pass dual criteria.
8. Screenshot + metrics dump. Room id captured for B1.

All observable on rendered UI per UI-PROOF.
