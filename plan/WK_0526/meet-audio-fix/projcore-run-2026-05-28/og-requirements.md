# OG Requirements — Meet Audio Silence Fix
**Created:** 2026-05-28  
**Source:** Investigation of May 26 + May 27 23:46 calls (zero audio both ends)  
**Investigation artifact:** conversation b3e90922 + SQLite session `89fb1f8c` diagnostics

---

## Confirmed failure modes (from investigation)

### Failure Mode A — "No track" at publish time
Evidence: diagnostics `sfuDiagnostics.outboundAudio.track = "unknown"`, `bytesSent = 0`, "Audio sender: No track"  
Cause: `room.page.ts:946` calls `sfuClient.publish({ localStream: this.media.localStream() })` at `admitted` WS message receipt; if `localStream` is null or has no audio tracks, `sfu-client.service.ts` `trackParams` filter (`t.sender.track !== null`) excludes every audio transceiver → Cloudflare Realtime session has zero audio tracks → remote users subscribing get nothing.

### Failure Mode B — Autoplay policy blocks remote `<audio>` elements
Evidence: session `89fb1f8c` (May 27 23:46) — ICE `connected`, relay→srflx, `bytesSent` and `bytesReceived` both increasing, 0 packet loss — audio arrives at RTCPeerConnection but elements are paused.  
Cause: peer joined 36 seconds after host's "Join" click → user activation expired; SFU PC reset at 23:47:40 created new `<audio>` elements; `room.page.ts:364` `effect()` fires `unlockAudioFromGesture(false)` via `window.setTimeout` — NOT a transient user activation → `audio.play()` rejected by browser autoplay policy → elements stay paused → silence despite live transport.

### Failure Mode C — Retry cap permanently blocks re-subscription (secondary)
Cause: `sfu-client.service.ts` `subscribeIfNeeded()` sets guard in `subscribedClientIds` BEFORE enqueue; after 7 retries (~16s), guard stays set forever. If Failure Mode A caused early failures, fixing A on the publisher side will NOT unblock an already-capped subscriber in the same call — they'll never retry.

---

## Requirements

| ID | Requirement | Acceptance | Failure Mode |
|----|-------------|------------|--------------|
| R1 | Before publishing to the SFU, the app MUST verify that `localStream` contains at least one live audio track. If not, publish MUST be deferred until the stream is ready (timeout 5s) or fail with a logged diagnostic error — no silent "no track" publish. | Diagnostics `outboundAudio.bytesSent > 0` within 10s of peer joining a call where mic is granted. | A |
| R2 | Remote audio MUST begin playing when a peer joins, regardless of when the user last interacted with the page. If browser autoplay is blocked, the app MUST show a visible, actionable in-call prompt so the user can unlock audio with a single click. | `<audio>` elements are playing (not paused) after a peer joins with no user interaction for >10s. No silent failure. | B |
| R3 | After an SFU PC reset (`resetForReconnect`), newly created remote audio elements MUST begin playing without requiring a fresh user gesture from the host. The post-reset state MUST be identical to the initial join state. | After simulated PC reset, remote audio resumes within 3s with no manual user action. | B |
| R4 | After an SFU PC reset, the subscriber retry guard for affected peers MUST be cleared so that re-subscription can be attempted if the publisher's tracks were unavailable during the prior retry window. | After PC reset, `subscribedClientIds` no longer blocks re-subscription for peers who hit the retry cap in the previous PC lifetime. | C |

---

## Out of scope for this run
- Backend log pipe (tsx "Rerunning..." PM2 issue) — separate operational concern
- TURN credential rotation — TURN is working (ICE connected relay in session `89fb1f8c`)
- May 26 root cause reconstruction (no SQLite data from that call)
- General diagnostics UI improvements
