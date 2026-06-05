Batch-FIX5: International call diagnostics completeness — capture + surface everything to prove the app is foolproof internationally (owner-only, zero user-facing change)

Batch ID: batch-fix5
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04
Branch: CONTINUE feat/crossplatform-devices-20260604 (FIX4 committed latest). Do NOT commit (projcore validates independently, then commits).
You are CODEX (gpt-5.5), TUI bypass mode. Claude /projcore supervises + validates INDEPENDENTLY. NO scope creep.
Effort tier: MEDIUM. Confirm/counter at PROPOSED.

## WHY (JROM, verbatim intent)
JROM just ran a PH↔US-ish test (VPN/iPhone). I had to dig the SQLite payload by hand to judge whether the media path was genuinely international and whether call quality held. JROM: "lets make sure we capture everything we need to make the app top notch and full proof in serving calls internationally aside from local in ph", and "just add it on the diagnostics i dont want to have this interfere on the app for the users." So: make the diagnostics capture + the OWNER-ONLY diagnostics page a complete, eyeball-able international-readiness instrument. STRICTLY owner/diagnostics-gated — NO change to the in-call UI normal users see.

## HARD CONSTRAINT — zero user-facing impact
- Capture additions go in the EXISTING `collectDiagnostics()` getStats() pass (sfu-client.service.ts) — reuse the SAME single `await pc.getStats()` report already fetched (do NOT add a second getStats call). Sampling stays the existing 7.5s `DIAGNOSTICS_LOG_INTERVAL_MS`, already gated by `computeEffectiveDiagnosticsEnabled` (diagnostics pref + global flag). No new timers, no in-call DOM, no perf cost beyond parsing a few more fields from the report already in hand.
- Surfacing goes ONLY in the owner-only `frontend/src/app/pages/diagnostics/diagnostics.page.{html,ts,scss}`. The room/call UI is untouched.

## PART A — CAPTURE the missing high-value international metrics (sfu-client.service.ts `collectDiagnostics`, from the existing stats report)
Today already captured: rttMs, local/remoteCandidateType, selectedCandidatePair{local,remote}.{address,port,protocol,candidateType} (egress IP + CF edge IP), connectionQuality{band,route,relayUsed,rttMs,packetLossPct,jitterMs,thresholds}, outboundTracks{bytesSent,packetsSent,framesEncoded/Sent,qualityLimitationReason}, inboundTracks{bytesReceived,packetsReceived,packetsLost,framesDecoded/Received,jitterBufferDelay,jitterBufferEmittedCount,concealedSamples}, outboundAudioSource{audioLevel,totalAudioEnergy}, subscribeLatencies, publish phase/status. ADD these (all from RTCStats already in the report — null-safe, optional fields):
1. **Candidate-pair bandwidth estimate** → on `DiagnosticsCandidatePair` (or the SFU snapshot): `availableOutgoingBitrate`, `availableIncomingBitrate`, `currentRoundTripTime` (already have rttMs from it), `totalRoundTripTime`, `bytesSent`/`bytesReceived` on the pair if present. These are the bandwidth headroom signals that matter on constrained international links.
2. **Send-side quality as the FAR END sees your uplink** → from `type === 'remote-inbound-rtp'`: add `roundTripTime` (s→ms) and `fractionLost` and `jitter` to the matching `outboundTracks[]` entry (match by ssrc/mid/kind). This is the truest "are they hearing me cleanly" metric — more honest than local outbound counters.
3. **Inbound audio liveness + jitter** → on `inboundTracks[]` (audio): add `audioLevel` and raw `jitter` (from inbound-rtp). audioLevel > 0 proves remote audio is actually arriving/audible, not just bytes flowing.
4. (If cheaply available from the same report) inbound `nackCount`/`pliCount` for video legs — OPTIONAL, only if trivial; do not over-reach.
Extend the corresponding types in `meeting-sessions.service.ts` (SfuOutboundTrackStats, SfuInboundTrackStats, DiagnosticsCandidatePair / SfuDiagnosticsSnapshot) with the new OPTIONAL fields (all `number | null`, optional). Backend persists payload_json verbatim (no backend schema change needed — confirm the diagnostics POST stores the whole payload as JSON; if it whitelists fields, note it).

## PART B — SURFACE an owner-only "International / Network path" readout (diagnostics.page)
In the existing "Latest diagnostics sample" grid AND each timeline entry, add a clearly-labelled network-path block per sample showing:
- **Egress IP** = `selectedCandidatePair.local.address`:port (`localCandidateType`/`protocol`) — the participant's public path. **CF edge IP** = `selectedCandidatePair.remote.address`. Label egress prominently — this is the "is this genuinely US / international?" tell.
- **RTT** (rttMs) + the **connection-quality band** (good/fair/poor) + **route** (direct/relayed) + **relay used** (TURN yes/no).
- **Loss/stability:** packetLossPct, send-side fractionLost, jitterMs, concealedSamples.
- **Bandwidth:** availableOutgoing/IncomingBitrate (kbps), bytes up/down.
- **Audio liveness:** outbound mic energy (sending sound?) + inbound audioLevel (receiving sound?) — prove BOTH directions.
- Keep platform/userAgent already shown.
- Add a tiny inline heuristic hint next to RTT: rttMs >= 150 → "long-haul (intl)"; < 80 → "local edge"; between → "regional". This lets JROM instantly judge whether a 'VPN' actually relocated the media (a US tunnel shows ~180–250ms; Cloudflare WARP stays ~25ms = local edge — the exact trap from the last test).
- OPTIONAL (secondary, only if low-risk): a best-effort geolocation of the egress IP shown as country/city. If you do it, do it owner-only on the diagnostics page (a best-effort fetch when a session is opened, non-blocking, failure-silent) OR leave a "geolocate" external link — do NOT add an in-call dependency and do NOT block the page on it. If it adds meaningful risk/complexity, SKIP it and just show the raw IP (projcore/JROM can geolocate). Confirm your choice at PROPOSED.

## Required (acceptance)
1. collectDiagnostics populates the new fields from the SAME single getStats() report (no second getStats); fields are null-safe (absent stat → null, no throw). A call with audio flowing shows inbound audioLevel > 0 and outbound remote-inbound fractionLost present.
2. The owner diagnostics page renders the full network-path block per sample (egress IP, edge IP, RTT+band+route+relay, loss/jitter/concealment, bitrate up/down, audio liveness both directions) WITHOUT errors when fields are null (graceful "n/a").
3. NO in-call UI change; NO new timer; NO second getStats; sampling cadence + diagnostics gating unchanged. Normal users (diagnostics off) see and pay nothing.
4. NO regression: existing diagnostics capture/persist/render, connectionQuality band, the FIX4 recovery path, normal call. Backend diagnostics persistence still stores the payload (verify it round-trips the new fields).

## Scope guards (MANDATORY)
- Touch: sfu-client.service.ts (collectDiagnostics field additions only — do NOT alter recoverTransport/doPublish/subscribe/transport state machine), meeting-sessions.service.ts (optional type fields), diagnostics.page.{html,ts,scss} (the owner-only readout), backend diagnostics store ONLY if it whitelists payload fields (prefer it already stores raw JSON — confirm, don't refactor). Plus tests.
- Do NOT touch the room/call template, SFU subscribe/publish/recovery logic, signaling, media, recorder. Behavior-preserving except the additive capture + the owner-page readout.

## Deterministic proof
- Unit (npx tsx): a collectDiagnostics-style parse over a synthetic RTCStatsReport containing candidate-pair (availableOutgoing/IncomingBitrate), remote-inbound-rtp (fractionLost, roundTripTime, jitter), inbound-rtp audio (audioLevel, jitter) → asserts the new fields land on the right outbound/inbound entries + candidate pair; missing stats → null, no throw. A diagnostics.page render/helper unit for the new labels with null-safe formatting.
- Re-run sfu-client.spec + any diagnostics-page/meeting-sessions specs. tsc app+spec 0. ng build green. Deploy DEV (pm2 restart meet-poc-fe). Backend: if touched, npx vitest the diagnostics module; else confirm untouched.
- BE HONEST: real intl numbers are JROM's live re-test; this batch proves the instrument captures + displays them.

## Plan handshake (MANDATORY)
1. Read brief + collectDiagnostics (full) + the candidate-pair/remote-inbound/inbound-rtp parse loops + the SfuDiagnosticsSnapshot/SfuInbound/Outbound/DiagnosticsCandidatePair types + diagnostics.page.{html,ts} latest-grid + timeline + the backend diagnostics POST/store (does it persist raw payload_json or whitelist?).
2. Reply PROPOSED: exact new fields + where parsed; the diagnostics-page block design; the geolocation decision (do/skip + how); backend persistence confirmation; test plan; files; risks; complexity confirm/counter.
3. End: `STATUS: PROPOSED — <one-line> · complexity: <tier> · why: <one line>`. WAIT for APPROVED-PLAN.

After APPROVED-PLAN: implement → tsc 0 → specs → ng build → deploy DEV → STATUS: DONE. Do NOT commit.

## Artifacts (under <run-dir>/validation/FIX5/)
scenarios.md, changes.md (the capture additions + the owner-page readout + per-file WHY + explicit no-in-call-change / no-second-getStats statement + backend-persistence note + geo decision), review.md, test-report.md, independent-validation.md.

## Completion protocol
- FIRST on any state change: append ONE line to <run-dir>/callbacks.md:
  `[projcore callback] batch-fix5 <PROPOSED|DONE|BLOCKED|NEEDS-INFO> <one-line>` — BEFORE prose.
- End EVERY reply with: `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>`.
