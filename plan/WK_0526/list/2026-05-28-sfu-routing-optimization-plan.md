---
date: 2026-05-28
type: research-plan
status: plan-for-review
agent: projcore
qa_verification: n/a (research/plan; no code changed)
---

# Plan: "best route" media optimization for our SFU

**JROM verbatim:**
> "add a detector on the best route for each user to communicate simulating the mesh setup but is workable for the SFU — if both parties are inside one network just have them communicate on the network … if they are on a same provider we compute for efficient path. check what we can do … investigate online … both you and codex … come back with a plan."

## The key finding (reframes the request)
Our SFU is **Cloudflare Calls / Realtime**, which is **anycast, not a single-region SFU**. Each PeerConnection connects to the **closest Cloudflare datacenter**; media fans out via **per-track cascading trees**. Two participants who are physically close / on the same network hit the **same (or nearest) edge**, so their media already **stays local** instead of crossing the globe. There is **no peer-to-peer path** — all media goes through Cloudflare's edge.

So the "if same network, talk locally" goal is **largely already satisfied at the edge** by Cloudflare's anycast. We can't make Cloudflare Calls do true LAN P2P — it's SFU-only by design.

## What is NOT worth building (and why)
- **Hybrid mesh / same-LAN P2P bypassing the SFU.** Cloudflare Calls has no P2P fallback; to route two same-LAN peers directly you'd run a *separate* RTCPeerConnection pipeline outside Cloudflare. Big re-architecture, only helps the narrow 2-people-same-LAN case, adds latency/complexity for everyone else, and undercuts why we use an SFU. ROI negative.
- **Region/edge selection logic.** Anycast already picks the nearest edge; manual selection would fight it.

## What IS worth building (ranked)

### 1. Connection-route detector + quality indicator  (HIGH value, LOW–MED effort) — the real "detector"
We already read `getStats()` candidate-pair info (host/srflx/relay, RTT). Turn it into a per-user signal:
- Classify each user's path: **direct (srflx/host)** vs **relay (TURN)** — relay = suboptimal/last-resort.
- Surface RTT + relay flag in the in-call UI (small "connection good/relayed/poor" chip) and to the host roster.
- Alert/log when a user is **stuck on TURN relay** (the real degraded case) so it's visible instead of silent.
- Already have `meeting_session_diagnostics` capturing relayUsed/candidate_types — add a per-user rollup + a diagnostics view.

### 2. Verify we never force TURN relay  (HIGH value, TRIVIAL effort)
Confirm `iceTransportPolicy` stays default `'all'` (host→srflx→relay preference) and relay is only a fallback. STUN+TURN are both configured; just assert we're not forcing `'relay'`. One-line audit + guard.

### 3. Same-network/same-ISP detection as INSIGHT  (MED value, MED effort)
Via signaling, compare participants' srflx public IPs / host-candidate subnets (and optionally ASN lookup) to label "same network / same ISP." Useful as **diagnostics** ("these two are co-located") — but with the SFU it does NOT change routing. Honest framing: it's an analytics signal, not a routing lever, unless paired with #5.

### 4. Simulcast / adaptive bitrate tuning  (MED value, MED effort)
Cloudflare supports simulcast. Ensure we publish layers + the SFU drops to lower layers on poor links — improves experienced quality on bad routes more than any path trick.

### 5. (Optional, future) True P2P fast-path for 1:1 calls  (the ONLY place mesh helps; LARGE effort)
The one legitimate mesh win: when a room has exactly **2 participants**, optionally establish a direct RTCPeerConnection between them (STUN/TURN, no SFU) for lowest latency, and fall back to the SFU at 3+. This is a known pattern but a separate media pipeline + failover logic. Only pursue if 1:1 latency is a priority.

## Goal reframe (JROM 2026-05-28): "faster + reliable — no disconnects, no lag"
The real target isn't local routing per se — it's speed + reliability. Re-ranked against THAT goal:

**Reliability (no disconnects) — do first:**
- **R1. TURN over TCP/TLS on 443.** The #1 cause of hard disconnects/connect-failures is ICE failing on restrictive NAT/corporate/mobile firewalls. Verify our Cloudflare TURN advertises `turns:…:443?transport=tcp` (not just UDP) so those users always have a path. Trivial-to-verify, highest reliability payoff.
- **R2. Reconnect robustness — partly DONE.** B15 (per-tab key + displaced guard) already removed the reconnect-loop that showed as "logged out / reconnecting." Also confirm grace-period resume + heartbeat liveness are healthy (they are, per the log review: real drops resumed in 20–40s, 0 expirations).
- **R3. Connection-route detector = observability** (was #1). Classify each user direct-vs-relay + RTT, surface a quality chip, and **alert when stuck on relay or RTT spikes** — so reliability/lag problems are visible, not silent. This is the achievable, useful form of the "detector."

**Speed (less lag):**
- **S1. Simulcast + adaptive bitrate.** Biggest lever for perceived lag on variable networks — publish layers, let the SFU drop receivers to lower layers on poor links. Cloudflare supports it.
- **S2. Don't force TURN relay** (`iceTransportPolicy: 'all'`, relay only as fallback) — relay adds a hop/latency; keep the direct edge path when available. One-line audit/guard.
- **S3. Geo latency = already handled** by Cloudflare anycast (nearest edge, cascading trees). No work.

## Recommendation
Sequence for the stated goal: **R1 (TURN 443/TCP) → R3 (route detector + relay/RTT alerts) → S1 (simulcast/adaptive bitrate) → S2 (assert no forced relay)**. R2 is largely shipped. Drop the same-LAN-P2P-bypass idea (not feasible on Cloudflare Calls; doesn't serve the goal). Hold true 1:1 P2P fast-path unless 1:1 latency becomes a specific priority.

**Independent cross-check:** codex (gpt-5.5, separate session, with web access) investigated in parallel and converged on the same conclusion — "turn the best-route detector into telemetry + SFU policy, not a hidden mesh router" — focusing on TURN minting/health, candidate-pair diagnostics, and simulcast.

## Sources
- Cloudflare Realtime — Calls vs regular SFUs: https://developers.cloudflare.com/realtime/sfu/calls-vs-sfus/
- Cloudflare blog — anycast WebRTC / cascading trees: https://blog.cloudflare.com/cloudflare-calls-anycast-webrtc/
- WebRTC topologies (mesh/SFU/MCU/hybrid): https://webrtcforthecurious.com/docs/08-applied-webrtc/
- ICE candidate preference / relay latency: https://webrtc.ventures/2022/04/ice-in-webrtc/

(Codex ran an independent parallel investigation; reconcile its findings file when complete.)
