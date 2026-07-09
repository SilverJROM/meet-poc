---
source: north (co-authored with codex55)
date: 2026-07-09
effort: meet-realcall-audio-fix
run: projcore-run-2026-07-09
priority: critical
search_hooks: [TURN refuted, single PeerConnection, sender liveness, totalAudioEnergy, packetsSent, bytesSent, self-heal wrong subsystem, absolute target loudness, webrtcperf, relay candidate, T1]
---

# D28 — codex55 consult: TURN hypothesis REFUTED; sender-liveness invariant is the missing test

JROM delegated this decision (2026-07-09, "use codex55 until <1% you have a go"). Consulted codex55
headlessly, adversarially (its brief: *find where I am wrong*). Outcome below. **/north's own hypothesis
was killed.** Recorded because a refuted hypothesis is a result.

## D28.1 — /north's TURN→STUN hypothesis is REFUTED as a cause

**/north claimed:** Acctg never gathered a relay candidate; TURN mint likely timed out; she silently fell
back to STUN; behind mobile-carrier NAT her media had no path out → one-way audio.

**codex55's refutation, verified in code by /north:** `sfu-client.service.ts` holds
`private pc: RTCPeerConnection | null` — **ONE bundled PeerConnection** (singleton `SfuClientService`,
one `new RTCPeerConnection` at :2156) carrying **both** directions. ICE selects a single transport.
**She could hear JROM ⇒ ICE/DTLS/SRTP to the SFU was alive.** A transport/NAT failure cannot selectively
kill only her outbound RTP on that same connection.

**Therefore:** transport worked. The failure is in **capture / sender / encode / SFU-publish**, not ICE.
The absent relay candidate signals *fragile connectivity risk*, not the cause of this call's one-way audio.

**Status of the ADD items:** (A) relay assertion **KEPT** (cheap; closes a real evidence gap; codex ranks
it #2). (B) TURN-mint-failure injection **DEMOTED** from "leading suspect" to a low-priority *resilience*
test — silent STUN degradation is still a defect, but it does not explain 07-08. It must not displace
capture-path work.

## D28.2 — THE FINDING: frozen `outboundAudioLevel` does not prove the capture died

`outboundAudioLevel = 0.228949858088931` (constant, `micSilent=0`) is **equally consistent** with:
- **(a) capture death** — the mic stopped producing samples; or
- **(b) a stalled sender** — capture is alive and producing energy, but RTP stopped advancing and the
  stats sample went stale.

**Disambiguator (in `getStats()`, never examined by any prior run):**
- `totalAudioEnergy` and `totalSamplesDuration` (media-source / capture side) — do they **advance**?
- `packetsSent` and `bytesSent` (outbound-rtp / sender side) — do they **advance**?

`totalAudioEnergy` advancing while `bytesSent`/`packetsSent` stall ⇒ **capture alive, sender dead.**
Both stalled ⇒ capture dead.

## D28.3 — Consequence: the shipped fix `856104f` may treat the WRONG SUBSYSTEM

`856104f` makes `classifyMicCapture` call a frozen non-zero level "silent" so the **R1 self-heal fires**.
The R1 self-heal **re-acquires the microphone**. If the real 07-08 failure was **(b) a stalled sender**,
re-acquiring the mic **fixes nothing** — the remedy would be `replaceTrack` / renegotiation / ICE restart.

**This is the honest answer to the open AC4 question** ("does the self-heal actually recover?"). It may
detect correctly and then apply an irrelevant remedy. **T1 is now DECIDABLE**, not merely open: the
sender-liveness invariant tells us which subsystem died.

**Required:** the self-heal must **branch on the invariant**:
- capture dead (energy not advancing) → re-acquire mic (current R1 behaviour), and
- sender dead (energy advancing, RTP stalled) → `replaceTrack` / renegotiate / ICE restart.

## D28.4 — Correct gain reference: ABSOLUTE target loudness (not the local publisher)

codex55 confirms the 2-party unity no-op (`loudest` degenerates when there is exactly one remote).
**Fix with an absolute target loudness reference**, plus smoothing, a noise gate / floor, and a max-gain
cap. **Do NOT use the local publisher's level as the reference.**
**Named failure mode:** local mic/AGC/noise differences make the remote gain chase the wrong source — it
would amplify a quiet remote's *noise floor*, or punish a good remote merely because the local speaker is
loud. (This kills /north's own candidate of "local publisher level".)
The `>=3-party` guard (C) stands: the fix must not regress `A = min(2.5·r, 0.88)` behaviour.

## D28.5 — One REJECT overturned: webrtcperf, scoped

codex55's strongest counter: `@vpalmisano/webrtcperf` (v4.9.0) is wrongly rejected **wholesale**. Its fake
media does bypass the capture path — so it is **BANNED from capture-path truth and from any PASS verdict**
— but it is genuinely good for **ICE/relay regressions, multi-party scaling, packet-loss/jitter/throttle
behaviour**. **Ruling:** ADMITTED for the `>=3-party` guard (C), relay-only load, and network stress.
**BANNED** as an arbiter and from capture-path assertions. The recording remains the arbiter.

**REJECTs upheld:** stats-as-arbiter (the 07-05 false-green mechanism); Playwright UA "device emulation"
(changes UA + viewport, not the audio stack); Android Studio emulator (replaces the device audio HAL — the
prime suspect, D22); `@cloudflare/realtimekit-device-emulator` at v0.0.2 (immature; the gUM shim covers it).

## D28.6 — Ranked tests (codex55), by P(catch) × cheapness

1. **Faithful capture attenuation + receive-side transcript arbiter** — highest. Shows "published but
   inaudible" while stats look alive. *(Already in the run: AC1/AC2 + the arbiter.)*
2. **Relay assertion + forced relay-only media call** — cheap; closes the missing-relay evidence gap.
3. **Sender-liveness invariant during real speech** — assert `totalAudioEnergy`/`totalSamplesDuration`
   **and** `packetsSent`/`bytesSent` advance while the far end transcribes speech. Catches frozen/stale
   `outboundAudioLevel`, stopped RTP, and capture-energy-without-network-send.

## Scope changes (binding on the replanned run)

- **NEW AC15 — Sender-liveness invariant.** During verified far-end-transcribed speech, assert
  `totalAudioEnergy` + `totalSamplesDuration` advance **and** `packetsSent` + `bytesSent` advance. Inject
  each failure independently (capture-dead; sender-dead-with-capture-alive) and prove the harness tells
  them apart. **This is the T1 discriminator.**
- **AC4 AMENDED.** Recovery must branch on the invariant: capture-dead → re-acquire mic; sender-dead →
  `replaceTrack`/renegotiate/ICE-restart. Proving "detected" is no longer sufficient; the **remedy must
  match the diagnosed subsystem**, and recovery is proven by far-end transcript.
- **NEW AC16 — Relay/ICE.** Client gathers a `relay` candidate; a forced `iceTransportPolicy:'relay'` call
  carries audio end-to-end (app already has `forceRelayDiagnosticRequested()`).
- **NEW AC17 — `>=3-party` guard.** The B09 gain fix must not regress multi-party. webrtcperf permitted
  here (never as arbiter).
- **AC1/AC2 gain fix** targets an **absolute loudness reference** + noise gate + cap. Not local publisher.
- **LOW PRIORITY — TURN-mint resilience:** stub `/api/ice-config` to time out / return STUN-only; assert
  the app degrades **loudly**, not silently. Not a cause; do not let it displace capture-path work.

## Process note

`/north` proposed a wrong root cause with conviction and codex55 killed it in one pass. The adversarial
co-author brief ("find where I am wrong") is what made that cheap — it cost ~7.4k tokens. Logged as
evidence for the deliberation-when-it-matters policy (D24), and against /north's own D2 rule
("diagnose, don't assume") which /north had just violated.
