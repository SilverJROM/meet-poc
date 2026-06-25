# B4 Drop Diagnosis: HRIS_TOJ / 11215094570c

VERDICT: client-internet (non-issue)

Session: `4ce56267-3c81-4775-bc26-1e65b268edab`
Room: `11215094570c` / `HRIS_TOJ`
Host: `silverjrom@gmail.com`
Window investigated: `2026-06-25 03:12:00Z` to `2026-06-25 03:23:37Z`

## Bottom Line

I do not find evidence that our app caused or worsened a multi-minute drop. The stronger finding is that the captured diagnostics do not show a multi-minute media outage on the host leg at all.

During the alleged 03:12 -> 03:23 outage, JROM's host client kept a connected SFU transport, connected ICE, connected WebSocket health, zero heartbeat misses, and continued receiving Joanne's media counters. Between `03:12:05Z` and `03:23:35Z`, the host captured 93 samples and Joanne's inbound media increased by:

| Track | Delta bytes | Delta packets | Delta frames/audio energy |
| --- | ---: | ---: | ---: |
| audio | 2,575,722 | 34,181 | audio energy 193.506 -> 228.282 |
| screen | 23,504,565 | 22,573 | frames 10,246 -> 14,938 |
| video | 0 | 0 | frames stayed 3,115 |

That rules out an app-side SFU/subscription/ICE/WebSocket failure that blocked all remote media for several minutes.

## Per-Leg Diagnostics

| Leg | Diagnostic rows | First | Last | ICE / transport | Candidate types | Notes |
| --- | ---: | --- | --- | --- | --- | --- |
| JROM host (`72cf0c22...`, client `24dd7264...`) | 684 samples, 14 state changes | `01:58:50Z` | `03:24:17Z` | SFU `connected`, ICE `connected` during 03:12 -> 03:23 | `host,relay`, selected pair `relay/host` | Main evidence source for host receipt of Joanne media. |
| Joanne remote (`555dddc2...`, client `eef0782c...`) | 21 samples, 1 state change | `02:02:01Z` | `02:04:39Z` | SFU `connected`, ICE `connected` while captured | `host,srflx` | Remote-side browser diagnostics stopped after 02:04:39, so the later window must be attributed from host-side receive stats and server logs. |

## Timeline

| Timestamp UTC | Event | Leg | Metric / evidence |
| --- | --- | --- | --- |
| `03:12:00` | Server receives `media-state` | server log | `logs/meet-poc-be-out.log` line `136228`. |
| `03:12:01` | Host diagnostic state-change | JROM host | WS connected; SFU connected; ICE connected; RTT 11 ms; selected pair `relay/host`; publish status `published`; peer Joanne `subscribed`; WS disconnect/reconnect/miss counters all 0. |
| `03:12:02` | Server receives `media-state` | server log | `logs/meet-poc-be-out.log` line `136229`. |
| `03:12:05` | Host sample after alleged drop start | JROM host receiving Joanne | Joanne inbound audio 15,352,678 bytes / 207,257 packets; screen 46,426,239 bytes / 45,885 packets / 10,246 frames; SFU+ICE connected; WS issues 0. |
| `03:12:05` -> `03:23:35` | Continuous host diagnostics | JROM host | 93 samples; SFU/ICE non-connected count 0; WS issue count 0; RTT min 8 ms, avg 26.3 ms, max 692 ms. |
| `03:13:58` | Mid-window media still flowing | JROM host receiving Joanne | Aggregate Joanne inbound reached 84,086,347 bytes / 284,562 packets / 15,406 frames; audio energy 197.78. |
| `03:17:58` | Mid-window media still flowing | JROM host receiving Joanne | Aggregate Joanne inbound reached 89,514,724 bytes / 301,048 packets / 16,990 frames; audio energy 208.64. |
| `03:21:58` | Mid-window media still flowing | JROM host receiving Joanne | Aggregate Joanne inbound reached 95,146,228 bytes / 317,591 packets / 17,946 frames; audio energy 223.18. |
| `03:23:35` | Last sample before republish | JROM host receiving Joanne | Joanne audio live and unmuted in `remoteAudioPlayout`; audio 17,928,400 bytes / 241,438 packets / energy 228.282; screen 69,930,804 bytes / 14,938 frames; video 7,786,342 bytes / 3,115 frames. |
| `03:23:37` | Server receives `sfu-publish`, then two `media-state` messages | server log / host state-change | `logs/meet-poc-be-out.log` lines `136323`-`136325`. Host still SFU+ICE connected, RTT 10 ms, WS issues 0, Joanne still `subscribed`. |
| `03:23:37` | Joanne media set changes | JROM host | Host state-change shows Joanne `screenOn: false`; inbound track list contains audio and video only, no screen. This looks like a client-side republish/media-state update, not transport recovery. |
| `03:23:43` | Post-republish sample | JROM host receiving Joanne | Audio continues increasing, remote audio element remains attached/live/unmuted. Screen track is gone; video has one more frame. |
| `03:24:17` | Joanne leaves | server log | `logs/meet-poc-be-out.log` line `136332` leave, line `136333` room membership decremented. |
| `03:24:18` | Host closes room | server log | `logs/meet-poc-be-out.log` line `136334` close-room, line `136335` closed by host. |

## Attribution

Ruled out our app as the cause/worsener:

- No host-side WebSocket failure: `disconnectCount=0`, `reconnectAttempts=0`, `heartbeatMissCount=0` in samples through the window.
- No host-side SFU/ICE failure: every host sample in the window had `sfuDiagnostics.connectionState=connected` and `iceConnectionState=connected`.
- No subscription drop: host peer state for Joanne remained `connectionState=subscribed` at `03:12:01` and `03:23:37`.
- No evidence of FIX4 transport recovery / relay refetch firing: no `transport-recovery`, `relay-refetch`, or ICE restart evidence was present in the server log search for the window, and host diagnostics kept `publishPhase=done` / `publishStatus=published`.
- Media counters contradict a multi-minute outage: Joanne's audio and screen counters continued to increase throughout the alleged gap.

What likely happened:

- The backend out log's 03:12 -> 03:23 gap is a gap in explicit `media-state`/`sfu-publish` messages, not a gap in all room traffic or media delivery. Server `ping` messages continued throughout.
- At `03:23:37`, Joanne's side sent `sfu-publish` plus `media-state`; the host observed her `screenOn` flip from true to false and the screen inbound track disappeared. That is consistent with a remote client-side media-state/republish event, not our app recovering from a failed host transport.
- Remote-side diagnostics for Joanne are incomplete after `02:04:39`, so I cannot prove her local ISP state directly during 03:12 -> 03:23. But the host-side receive stats prove our SFU/subscription path was alive and carrying her audio/screen during that interval.

## Fix Queue Recommendation

No app fix should be queued for the reported drop unless there is separate client-local evidence outside this DB showing a real user-visible loss while host receive counters were advancing.

Useful follow-up, if diagnostics hardening is desired: capture remote participant diagnostics for the full session, not just the first few minutes. In this session, Joanne's diagnostic rows stopped at `02:04:39`, which limited direct client-side attribution for the later window.
