# Queue — SFU optimization (codex-in-tmux, gpt-5.5 implementer)

- [DONE] SB1: ICE/TURN reliability — ensure TURN over TLS/TCP 443 in /api/ice-config + assert client iceTransportPolicy 'all' (SR1, SR2)
- [DONE] SB2: Connection-route detector — classify direct/relay + RTT/loss from getStats; in-call quality indicator + relay/degraded alert (SR3)
- [DONE] SB3: Adaptive simulcast — drive subscriber layer off SR3 quality signal; poor link → lower layer, recover (SR4)
