# SFU Routing Recommendation for meet-poc

## Bottom line

Do not build an automatic hybrid mesh+Cloudflare-SFU media router for meet-poc right now. With Cloudflare Realtime/Calls, the practical product is SFU-first: every participant establishes a WebRTC PeerConnection to Cloudflare, publishes local tracks to Cloudflare, and pulls remote tracks from Cloudflare. Same-LAN or same-ISP signals can be detected and logged, but they cannot make Cloudflare route a given pair directly over the LAN or inside an ISP. To get true LAN/P2P media for selected pairs, meet-poc would need a second, app-owned P2P media plane beside Cloudflare, plus complex reconciliation of recording, screen share, audio unlock, device switching, reconnect, diagnostics, privacy, and fallback behavior.

The right implementation shape for JROM's request is therefore: build a "route quality detector" that classifies each participant's SFU path, detects same-NAT/ASN as diagnostic metadata, and uses that metadata only for observability and SFU tuning: ICE/TURN validation, relay avoidance where possible, simulcast layer choice, bitrate/codec constraints, and weak-connection policy.

## What Cloudflare Calls can and cannot do

Cloudflare Realtime is an SFU/data-plane product, not a browser-to-browser path selector. Cloudflare's own docs describe the client establishing a PeerConnection to the nearest Cloudflare location via anycast, and the Sessions/Tracks model maps a Session directly to that PeerConnection. Tracks are pushed to Cloudflare and then pulled by other Sessions. Cloudflare also notes that developers can combine Realtime with peer-to-peer architecture, but that means the application adds a separate P2P architecture; it is not a Cloudflare-provided P2P fallback inside a Calls session.

Implications for meet-poc:

- The existing `SfuClientService` is correctly shaped for Cloudflare: one browser PeerConnection, `/api/sfu/session`, `/api/sfu/tracks`, and Cloudflare track IDs shared through signaling.
- A same-LAN optimization cannot make Cloudflare skip the SFU for Alice-to-Bob while keeping the same Cloudflare track subscription model.
- A hybrid mesh+SFU option is technically feasible only as an additional media plane: create direct peer RTCPeerConnections for selected pairs and choose which media elements play from P2P vs SFU. That is a substantial architecture change, not a routing tweak.
- Because meet-poc already has SFU diagnostics, recording/session concepts, screen share, reconnect, mobile limits, and audio unlock work, a second media plane has a high regression surface.

Sources:

- Cloudflare Realtime SFU intro: https://developers.cloudflare.com/realtime/sfu/introduction/
- Realtime vs regular SFUs: https://developers.cloudflare.com/realtime/sfu/calls-vs-sfus/
- Sessions and Tracks: https://developers.cloudflare.com/realtime/sfu/sessions-tracks/
- Example architecture: https://developers.cloudflare.com/realtime/sfu/example-architecture/

## What can realistically be optimized in a Cloudflare SFU path

1. ICE candidate policy and TURN fallback

Keep default ICE policy as `all`, not `relay`, so host/srflx candidates can win when viable and TURN is only fallback. Use force-relay only as a diagnostic or emergency setting. meet-poc already has `/api/ice-config`, Cloudflare TURN credential minting, `IceConfigService.checkTurnHealth()`, and diagnostics for selected candidate types. That is the correct foundation.

Current Cloudflare TURN docs show TURN as a relay between browser clients and SFUs when NAT/firewalls block direct connectivity to the SFU, and describe anycast behavior for `turn.cloudflare.com`. They also currently document `generate-ice-servers`; the local backend uses `/credentials/generate`. Before implementation work, verify the live account endpoint and response shape, then normalize to the browser's `RTCIceServer[]` shape. Do not hardcode credentials.

Sources:

- Cloudflare TURN service: https://developers.cloudflare.com/realtime/turn/
- Cloudflare TURN credential generation: https://developers.cloudflare.com/realtime/turn/generate-credentials/
- MDN ICE candidate types: https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidate/type
- MDN WebRTC connectivity and candidate-pair selection: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity

2. Cloudflare anycast edge behavior

The app does not choose the Cloudflare media edge. Cloudflare anycast chooses the nearest/lowest-latency Cloudflare location from each client. Same-ISP detection should not override this because "same ISP" does not imply a better direct path than client-to-nearest-Cloudflare plus Cloudflare backbone. At most, expose edge/path quality through observed stats: RTT, relay use, packets lost, jitter, reconnects, and subscribe latency.

3. Simulcast and bitrate

This is the highest-leverage media optimization in the current stack. The repo already publishes camera video with three simulcast layers (`h/m/l`) and updates preferred RID based on mobile, screen share, and number of subscribed video peers. Extend that model with route-quality inputs:

- If a subscriber's SFU path shows sustained high RTT/loss/jitter, prefer `m` or `l` for that subscriber.
- If a user is on mobile, backgrounded, screen share is active, or the room has many active videos, bias to lower camera layers.
- Keep screen share legibility separate from camera policy; screen share often deserves higher resolution but lower frame rate.
- Capture whether degradation came from relay, loss, CPU encode limitation, or mobile/background policy.

Sources:

- Cloudflare simulcast docs: https://developers.cloudflare.com/realtime/sfu/simulcast/
- MDN WebRTC codecs baseline: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/WebRTC_codecs

4. Codec and sender constraints

Do not chase custom network routes before sender policy is stable. Browser-compatible baseline video codecs are VP8 and H.264, audio is Opus/G.711. For this app, codec choice is less important than predictable bitrate caps, simulcast layers, and recovery behavior. If codec work is needed later, add measurement first: outbound encode limitation, frames encoded/sent, decode frames, loss, jitter, RTT, and device class.

5. Packet path visibility

The browser can expose selected candidate-pair stats, local/remote candidate type, protocol, RTT, bytes, loss, jitter, and RTP counters. It cannot expose a full ISP route or force BGP/ISP path selection. Treat "best route" as observed performance classification, not a route computation engine.

## Same-network and same-ISP detection

Detection options:

- Same LAN: compare host candidates/private IP subnets only when the browser exposes them. This is increasingly limited by browser privacy protections and mDNS host candidates. It is useful as a weak signal, not a guarantee.
- Same NAT/public IP: compare server-observed request IPs or srflx candidate public IPs. If two participants share the same public IP, they are likely behind the same NAT, corporate egress, VPN, or carrier-grade NAT. This does not prove direct LAN reachability.
- Same ISP/ASN: derive ASN/provider from the public IP on the backend using a trusted IP intelligence source. This is useful for diagnostics and aggregate reports, not routing.
- Same Cloudflare edge/colo: if the web app is behind Cloudflare, a lightweight diagnostic endpoint can report HTTP edge metadata, but this still may not equal the media edge. Use as an approximate telemetry field only.

What can be done with these signals in an SFU-only product:

- Show diagnostics such as `same public IP`, `same ASN`, `relay used`, `srflx direct to SFU`, `TURN over UDP/TCP/TLS`, and `RTT/loss class`.
- Correlate failures: for example, same-NAT users using relay may indicate corporate firewall restrictions, not a missing LAN route.
- Tune subscriber simulcast preference and warning text.
- Build field reports for JROM to understand whether users are failing because of NAT, relay reachability, bandwidth, or device constraints.

What cannot be done without a second P2P media plane:

- Make two same-LAN participants send media directly to each other while other participants consume the same media through Cloudflare.
- Ask Cloudflare Calls to keep the control/session model but selectively bypass the SFU per participant pair.
- Compute a provider-internal shortest path from the browser. Same ASN is not enough information, and the browser has no ISP routing control.

Privacy note: candidate addresses and public IP/ASN metadata can reveal location/network topology and can be fingerprinting material. Keep this out of ordinary participant UI unless there is a clear diagnostic reason; store only coarse classifications where possible.

Sources:

- MDN `RTCIceCandidate.address` security notes: https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidate/address
- mDNS ICE candidate privacy draft: https://www.ietf.org/archive/id/draft-ietf-mmusic-mdns-ice-candidates-02.html

## Ranked recommendations for this stack

1. Keep Cloudflare SFU-only for production media routing

Effort: none to low. Impact: high risk reduction.

Do not add mesh/P2P media routing as part of this request. It would duplicate the media plane and create hard failure modes around recording, screen share, audio unlock, reconnect, diagnostics, and mobile background behavior. If P2P is ever pursued, scope it as a separate architecture project with explicit fallbacks and user-visible diagnostics.

2. Implement a route-quality detector, not a route-switcher

Effort: medium. Impact: high.

Build a per-participant/per-session detector that records:

- selected local/remote candidate type: host/srflx/relay
- protocol: udp/tcp/tls where exposed
- relayUsed boolean
- RTT, packets lost, jitter, bytes/frames sent/received
- TURN health result
- samePublicIp boolean from backend-observed request IP
- sameAsn/provider from backend IP lookup, if a provider is chosen
- coarse quality class: good, constrained, relay, failing

Most of this is already present in `SfuClientService.collectDiagnostics()`, `IceConfigService.checkTurnHealth()`, diagnostics storage, and the diagnostics UI. Extend that path rather than creating a new media router.

3. Use detector output to drive simulcast/RID and bitrate policy

Effort: medium. Impact: high.

Current code already has `VIDEO_SIMULCAST_ENCODINGS` and `updateCameraLayer()`. Extend the preferred RID decision so subscriber quality can select lower layers per remote track. This is the closest practical equivalent to "best route" inside an SFU: keep everyone on the Cloudflare path, but adapt what each subscriber receives.

4. Harden ICE/TURN configuration and validation

Effort: low to medium. Impact: medium-high.

Keep `iceTransportPolicy: all` by default. Keep force-relay as a diagnostic control only. Verify the currently documented Cloudflare TURN credential endpoint and normalize the response shape. Prefer UDP TURN first, keep TCP/TLS fallback, and avoid adding browser-hostile alternate ports unless trickle ICE makes the timeout harmless. Continue logging selected candidate-pair state so field sessions prove whether TURN is actually used.

5. Add backend same-public-IP and ASN enrichment for diagnostics

Effort: medium. Impact: medium.

At signaling join/admit time, persist a coarse network profile for each client: public IP hash or exact IP only if acceptable for ops, ASN, provider name, country/region if useful, and timestamp. Use it to annotate diagnostics and support reports. Do not expose exact IPs to other participants.

6. Optional: add a P2P probe only as a diagnostic experiment

Effort: medium-high. Impact: low-medium.

A short-lived datachannel-only P2P probe could test whether two participants can connect directly and measure RTT without carrying media. This may help decide future P2P feasibility, but it should not alter media flow. Browser privacy/mDNS and NAT behavior mean the result is not always stable.

## Not worth doing now

- Automatic hybrid mesh+SFU media routing: too much architecture and regression risk for unclear benefit. Cloudflare Calls will still be needed for group scale, TURN fallback, and global reach.
- Same-ISP "efficient path computation": not feasible from browser-side WebRTC stats. ASN equality is a weak label, not a route graph.
- Forcing TURN for everyone as a performance strategy: useful for diagnosis, bad as default. It increases relay dependence and may add latency/cost.
- Trying to manually rewrite ICE candidate priorities to prefer LAN/same-ISP paths to Cloudflare: there is no peer LAN path in the Cloudflare SFU session; ICE is choosing the browser-to-Cloudflare path.
- Exposing raw IP/candidate details in normal user UI: too much privacy and support risk. Keep it in admin diagnostics.

## Recommended acceptance shape

A good first implementation batch should be accepted when:

- Diagnostics can say, for each participant's SFU session, whether the selected path is `host`, `srflx`, or `relay`, with RTT/loss/jitter and TURN health.
- Backend diagnostics can group participants by same public IP and same ASN/provider without exposing raw IPs to normal users.
- The app does not change production media routing away from Cloudflare SFU.
- Simulcast layer selection uses quality signals and participant/device context, and the diagnostics explain why a lower layer was chosen.
- Field reports answer JROM's operational question: "are these users local/same-provider, and is the SFU path healthy or constrained?"

STATUS: DONE — Recommend SFU-only routing with route-quality detection, diagnostics enrichment, and simulcast/TURN tuning; avoid hybrid mesh media routing for Cloudflare Calls.
