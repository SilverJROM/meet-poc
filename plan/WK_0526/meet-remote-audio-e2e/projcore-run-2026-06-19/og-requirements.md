# OG Requirements — Remote (cross-world) multi-party MEASURED audio in a meet-poc call

**Authored by projcore from JROM's verbatim goal (2026-06-19), since there is no pre-existing spec.**
This is the acceptance contract. A requirement is VERIFIED only by observed, measured behavior on the rendered app — never by a green test alone or an API read (§1.11 UI-PROOF).

## Verbatim goal (JROM)
> "the goal is peer2's machine can join our call and you can hear him and he can hear you ... priority is voice right now. if we can test the vid its good but priority is voice." Each party emits a KNOWN fake/generated audio signal; PASS = that signal is measurably received at every other party's end. Topology per call = 2–3 automated parties (I host; Peer2-codex on creepy-mini joins via the JohnnyOne relay; optionally a sonnet-driven client joins from our side). JROM is NOT a participant.

## Acceptance criteria (numbered, the contract)

| R# | Requirement | Acceptance proof (measured, on the rendered app) |
|----|-------------|--------------------------------------------------|
| R1 | **DEV is up and hostable.** meet-poc DEV (`https://voice.silverjrom.app`, local PM2 `meet-poc-be`+`meet-poc-fe`) is running; host can create/open a throwaway room reachable by a remote long-haul participant. | `/health` 200 + host browser at `/room/:id` shows the in-call view; room id captured. |
| R2 | **Remote participant joins.** `creepy-mini` (Peer2-codex, headed/headless Chrome via relay) opens the room link, completes the join path (knock→host admit, or guest path), and reaches a connected+publishing state. | On host screen: the remote participant tile appears + is admitted (participant sidebar count increments). On remote: `getStats` shows an active outbound audio track + ICE `connected`/`completed`. |
| R3 | **Host → Remote audio is received.** Host publishes a KNOWN test signal (fake-audio file/tone). Peer2-codex measurably receives it. | On remote: WebAudio AnalyserNode RMS/energy on the inbound host audio track > threshold for ≥3s, AND `getStats` inbound-rtp `bytesReceived`/`audioLevel` rising. Screenshot/log artifact. |
| R4 | **Remote → Host audio is received.** Peer2-codex publishes a KNOWN test signal. Host measurably receives it. | On host: WebAudio energy on the inbound remote audio track > threshold for ≥3s, AND inbound-rtp stats rising. Screenshot/log artifact. |
| R5 | **(3-way, optional-but-targeted) Full-mesh audio.** A second local sonnet-driven client joins. Each party's KNOWN signal is measurably received by BOTH other parties. | Per-receiver energy + inbound-rtp above threshold for every (sender→receiver) ordered pair. Matrix artifact. |
| R6 | **Reproducible on a clean join.** The multi-party audio delivery (R3+R4, and R5 if in scope) passes on a fresh join, repeatably — ≥2 consecutive clean runs with no manual nudging. | Two back-to-back run logs, both PASS, captured. |
| R7 | **(STRETCH) Video both ways.** If voice is solid, video frames flow host↔remote. | inbound-rtp video `framesDecoded`/`bytesReceived` > 0 on both ends + visible tile. |

## Measurement standard (applies to R3–R6)
- "Measurably received" = BOTH (a) WebAudio energy/RMS above a calibrated silence floor for ≥3s, AND (b) `RTCPeerConnection.getStats()` inbound-rtp audio `bytesReceived` strictly increasing. A single signal is insufficient; both must agree to defeat false positives (e.g. comfort noise, a stuck non-zero level).
- Each party emits a DISTINCT known signal so the receiver can attribute the source (different tone freq or different fake-audio file per party).

## Out of scope / guardrails
- DEV only (`voice.silverjrom.app`); never QA/PROD.
- Dedicated THROWAWAY room, cleaned up at end; NEVER touch persistent TEST_ROOM01 (`testroom01001`).
- JROM is not a participant; the whole loop is automated.
- This is a real long-haul/international path (TURN+SFU) → doubles as intl-call validation ([[project_meet_intl_call_verification]]).

| R8 | Per-user recording for transcription. The call recording captures EACH participant's voice as a SEPARATE track (host + remote agent), so each can be transcribed accurately without overlap. | A recording artifact exists from the call AND per-participant audio is separable (distinct tracks/files per speaker), verifiable on the rendered app/recordings list. |

| R9 | Clean transcription. The recorded call is transcribed accurately per speaker (host + remote agent), no garble/overlap, suitable for logging. | A transcription artifact exists AND is accurate per-speaker, verifiable on the rendered app / produced file. |

| R10 | Zero-setup join. A user joins the call and everything works (audio/video/recording/transcription) with ZERO setup/config — the only user action is granting browser mic/camera permission. No config screens, URL params, toggles, or device-setup gates blocking entry. | Open plain room URL → grant mic/cam → fully working call, no other user input; verifiable on the rendered app. |

| R11 | Screen sharing. A participant shares their screen and other participants RECEIVE + render it (screen track via SFU, framesDecoded/bytesReceived > 0 on receivers). | Sharer starts screenshare → receivers show the screen track with decoded frames; verifiable via getStats + rendered tile. |
