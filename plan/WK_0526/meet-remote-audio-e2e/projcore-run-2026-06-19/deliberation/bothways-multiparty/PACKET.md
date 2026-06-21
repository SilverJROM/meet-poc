# DELIBERATION PACKET — clean both-ways audio + multi-party (3-way/4-way) verification (front-load)

## State (the GOOD news)
The remote agent (Peer2-codex, creepy-mini, real Logitech C930e mic) now JOINS our meet-poc call (Cloudflare TURN + Calls SFU): in-call, ICE connected, published, 150s stable. Proven so far:
- AGENT hears host: inbound-rtp rising (6933 bytes) in an earlier run.
- HOST hears agent: host measured the agent's 880Hz (inbound RTP + energy + spectral attribution) in a later run.

## The PROBLEM to deliberate
1. We do NOT yet have ONE clean SIMULTANEOUS run proving BOTH directions at once. In the latest run, the AGENT's inbound was 0 (it did not hear the host's 440Hz) — host had just restarted (timing). Is agent-inbound-0 just timing, or a real our-side gap (host tone not actually published to SFU? agent not subscribed to host's track? SFU fan-out issue? tone strength)? Design the deterministic way to get + verify a single simultaneous both-ways run.
2. MULTI-PARTY (JROM wants this before video/durability): 3-WAY then 4-WAY full-mesh — host(440Hz) + Peer2 agent(880Hz) + local client(660Hz) [+4th 1100Hz], EVERY party measures EVERY other party's inbound energy + spectral attribution via the Cloudflare SFU fan-out. Design how to verify N-way full-mesh reliably (per-pair proof), how to spin up the extra local automated clients, and the gotchas (SFU subscriber limits, per-publisher track routing, measurement per remote track).

## Context / files
- Host + extra clients = automated browsers on OUR side (grok drives). Agent = Peer2-codex remote (relay, real mic). Measurement: getStats inbound-rtp + WebAudio AnalyserNode energy + spectral peak attribution per remote publisher.
- App is SFU-based (Cloudflare Calls): each client publishes to SFU + subscribes to all others. Files: frontend/src/app/services/meeting-sessions.service.ts (sfu client/getStats), room.page.ts, e2e/fixtures/audio-rig.ts (B0 measurement util).
- Known app bug (separate): __meetDebug.micWorking stays false despite hasMicAccess/micVerified/localStream true + join proceeding.

## YOUR TASK (each panelist, independent, READ-ONLY)
1. Diagnose agent-inbound-0: most likely cause + the deterministic fix/sequence to guarantee a clean SIMULTANEOUS both-ways capture (host stably publishing to SFU BEFORE agent joins, both measure in same window, per-track attribution).
2. Design the N-way (3/4) full-mesh verification: how each party reliably subscribes to + measures every other publisher's audio (energy + spectral attribution), how to spin the extra local clients, SFU gotchas, what "pass" looks like per-pair.
3. Risks / failure modes (SFU subscriber routing, tone collisions, measurement attribution at N>2).
4. Converged recommendation + file:line where relevant.
Lean + specific. Converge once → implement.
