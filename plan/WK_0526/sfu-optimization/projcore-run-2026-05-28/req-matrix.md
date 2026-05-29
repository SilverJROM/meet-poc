# req-matrix — SFU optimization

| Req# | Requirement (first 80 chars) | Slice | Evidence | Status |
|------|------------------------------|-------|----------|--------|
| SR1 | TURN over TLS/TCP 443 path in /api/ice-config; relay fallback not forced | SB1 | live /api/ice-config returns turns:…443?transport=tcp + 5349?tcp (was dropped pre-fix: Cloudflare array shape); test 10/10; build green | VERIFIED |
| SR2 | Client iceTransportPolicy 'all' — never forces relay | SB1 | media PC sfu-client.ts:770 = new RTCPeerConnection({iceServers}) (no policy→'all'); only 'relay' is the diagnostic TURN probe (intentional) | VERIFIED |
| SR3 | Per-participant route detector: direct vs relay + RTT/loss; indicator + relay/degraded alert | SB2 | sfu-client classifier (relay/RTT/loss/jitter, 150/300·2/5·30/60 bands); 5s sampler; episode-throttled relay+poor alert (3 samples, resets on recovery); controls-bar chip (in bundle: "Relayed"/"Poor connection"); build green; scoped 7 files | VERIFIED |
| SR4 | Adaptive simulcast: poor link → lower subscriber layer, recovers | SB3 | cameraRidNow=min(base,cap); cap poor→l, relayed-fair→l, fair→m, good→none; 3-sample hysteresis; reapplied via updateCameraLayer→/api/sfu/tracks/update; published encodings unchanged; ng build green; 1 file | VERIFIED |
