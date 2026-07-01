# OG Requirements — Voice SFU Self-Heal (WK_0701)

Source: `plan/WK_0701/voice-sfu-self-heal-tasklist.md` (JROM handoff, 2026-07-01).
Two real calls failed with "connected but cannot hear each other": `JROMRoom` (with Peer2)
and `HRIS_TOJ` (5-way, had to move to Google Meet). Backend admitted users + WebSockets
stayed live, but SFU media subscriptions did not converge.

**North star (verbatim intent):** The app must NOT leave users in a "connected but cannot
hear each other" state. For every admitted participant with advertised remote audio, the
client must either (1) subscribe and receive usable audio, (2) self-heal by retry →
renegotiate → SFU rejoin, or (3) clearly report unrecovered failure with an actionable
recovery. **Silent failure is unacceptable.**

**Framing correction (grounded in code):** the self-heal ladder ALREADY exists
(`planSubscribeRetry`, subscribe stuck-timers, renegotiation retry, `resubscribePublisher`,
`rejoinAfterInitialPublishFailure`). The defect is that it **gives up** — the permanent-stop
cap (`sfu-client.service.ts:258`, "guard stays set until cfSessionId changes") halts retry
forever while the publisher still advertises audio — and lacks post-subscribe stall
detection. Do NOT rebuild retry from scratch; fix the give-up + add stall detection.

---

## R1 — Fault-injection reproduction (harness)
A local/dev test path can reproduce SFU subscription failure without waiting for Cloudflare
to fail live.
**Acceptance:**
- A test can force `/api/sfu/tracks` to return `406` for a selected participant/request.
- A test can simulate a remote track advertised-but-never-subscribed.
- A test can simulate a subscribed inbound audio track with no usable audio progress.
- The current **non-healing / give-up** behavior is reproduced (fails) BEFORE any fix lands.

## R2 — Subscribe-failure self-healing (the cap → rejoin escalation)
When `/api/sfu/tracks` fails or a remote track stays `advertised-not-subscribed`, the app
recovers and does NOT terminally give up while the user is admitted and audio is advertised.
**Acceptance:**
- Retried subscription attempts are bounded per-step AND observable.
- **The permanent-stop cap escalates** retry → renegotiate → full SFU rejoin (fresh
  `cfSessionId`) instead of terminal give-up (JROM-locked 2026-07-01).
- Retry does not permanently stop while the user is admitted and the publisher advertises audio.
- Diagnostics record each recovery step + outcome.

## R3 — Stalled remote-audio detection
When a client appears subscribed but receives no usable audio, the app detects it and recovers.
**Acceptance:**
- Distinguishes healthy silence (publisher mic off) from broken inbound audio
  (packets/bytes/energy/emitted samples stalled or concealed).
- Stalled audio triggers recovery, not just a diagnostics row.
- Recovery is per-publisher and does NOT destroy unrelated healthy remote streams.

## R4 — Publish/PeerConnection-failure recovery
An admitted user with no SFU Pc or failed publish (`hasPc:false`, `publishStatus:null/error`)
after joining is recovered (Glory-like state in call 2).
**Acceptance:**
- The app identifies the state as media-not-published.
- It retries publish or rejoins SFU without the user manually leaving.
- If unrecoverable, the UI states exactly what failed.

## R5 — Diagnostics honesty
Diagnostics identify the failing layer correctly.
**Acceptance:**
- `/api/sfu/tracks` failures are NOT recorded as `lastGumError`.
- Separate fields for device / publish / subscribe / recovery / playout / remote-inbound stats.
- `advertised-not-subscribed` is obvious + actionable in the payload/page.

## R6 — Multi-participant regression coverage
The fix covers more than a 2-person call.
**Acceptance:**
- Local tests cover 2-person AND 5-person subscription graphs.
- Real-machine validation covers JROM + Peer2 (agent-measured healthy audio both ways).
- 3-way (JROM + Peer2 + dev_machine) agent-measured validation before dev_machine shutdown.

---

## Acceptance ladder (JROM-locked 2026-07-01)
1. **Autonomous:** Phase 0 → B6 local proof → B7/B8 agent-measured healthy audio both
   directions (RTP + energy + diagnostics, advertised-not-subscribed cleared, recovery
   proven under fault injection).
2. **dev_machine shuts down after B8** (its 3-way agent job done).
3. **Final human-audible gate (the real "fixed"):** projcore pings JROM → JROM opens a room,
   Peer2's machine joins and plays a known sound, JROM confirms he HEARS it. No requirement
   is VERIFIED until JROM confirms audible.

## Observability note (R5 detail)
Separate: local device/media acquisition errors · SFU publish errors · SFU subscribe errors ·
remote audio playout errors · silent/stalled RTP stats.
