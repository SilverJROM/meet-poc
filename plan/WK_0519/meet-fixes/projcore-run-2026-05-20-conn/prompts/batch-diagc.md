Batch-DIAGC: Voice-first weak-connection resilience (DR-11)

Batch ID: diagc
Requirement: DR-11 (full text in plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/og-requirements.md)
Branch: continue on fix/meet-conn-diag (current tip).

**Protocol: projcore v2.0.** Plan handshake first (STATUS: PROPOSED → wait for APPROVED-PLAN → code). Final action of every STATUS reply: append `[projcore callback] diagc <STATE> <note>` to the run callbacks.md. End every reply with `STATUS: <verb> — <reason>`.

## Why this exists (JROM real call)

A weak-signal peer connected but no audio/video flowed until her signal improved; even then HER reception never worked (she saw/heard nothing from the other side) — asymmetric. JROM wants: detect weak connection → fall back to **voice-only** so "at least we can talk", and stop pulling video when the link can't carry it. Chosen scope = **auto-degrade + manual toggle** (not just manual, not full adaptive-bitrate).

## Requirement DR-11 (scope = auto-degrade + manual)

a. **Quality detection** — per peer connection, poll `getStats()` (~2-3s) for inbound packet-loss / jitter / RTT + outbound available-bitrate; classify good / weak / poor. **Reuse the DR-2 diagnostics infra** (you already track per-peer states + getStats candidate type — extend it).

b. **Auto-degrade to audio-only** — when a peer's connection is **sustained poor** (hysteresis — e.g. poor for ~3 consecutive samples / ~6s, not a single blip): drop VIDEO, keep AUDIO. Critically handle BOTH directions:
   - Stop SENDING local video to peers (free uplink).
   - **Signal peers to PAUSE video sent TO this peer** — the asymmetric-downlink case: a weak RECEIVER must get others to stop sending it video, since its problem is the downlink, not its own uplink. Use a small signaling message over the existing WS channel (you added renegotiation in DR-4 — reuse the pattern). Resume video to a peer when it signals recovery.
   - Show a "Weak connection — audio only" banner on the affected peer.
   - Auto-restore video when sustained-good (hysteresis to avoid flapping — e.g. good for ~5 samples / ~10s).

c. **Manual audio-only toggle** — a control anyone can hit proactively to force audio-only (and a way back). When manual is ON, auto-restore must not override it.

d. **Per-peer connection-quality indicator** — a small good/weak/poor pill per remote tile (and/or in the diagnostics panel).

**AUDIO MUST NEVER BE DROPPED.** Only video degrades.

## Observed (confirm by reading)

- `frontend/src/app/services/webrtc.service.ts` — DR-2 already added per-peer state tracking + getStats; DR-4 added renegotiation + restartIce over signaling. EXTEND: quality classification from stats, video-pause/resume per peer, stop/restore local video send (RTCRtpSender encoding active or replaceTrack(null)).
- `frontend/src/app/services/media.service.ts` — local video track control.
- `frontend/src/app/pages/room/room.page.{ts,html,scss}` — banner, manual toggle (controls bar), quality pill on tiles, __meetDebug hooks.
- backend signaling/index.ts — relay the new video-pause/resume message (opaque relay likely already supports it; confirm).

## Scope

- Implement DR-11 only (quality detection + auto-degrade + manual toggle + quality pill).
- NO adaptive video bitrate ladder / resolution stepping (that was the 'full adaptive' option JROM did NOT pick — audio-only is the degrade target).
- NO SFU / simulcast (long-term, out of scope).
- Do NOT regress DR-1..DR-10 or FIXC work.
- Audio path untouched/never dropped.

## Plan handshake (MANDATORY)

STATUS: PROPOSED with: how you classify quality from getStats (which metrics + thresholds), the hysteresis approach (degrade + restore sample counts), the video-pause/resume signaling mechanism for the asymmetric-downlink case (this is the key design point — name it), how manual-toggle interacts with auto (manual wins), planned files, risks. Append callback. Wait for APPROVED-PLAN.

## Tests

- Inject/stub poor getStats for a peer → assert auto audio-only kicks in (local video send stops + pause signal sent) + banner shows, after the hysteresis window.
- Stub recovery → assert video restores (unless manual audio-only is ON).
- Manual toggle → assert video drops/restores; assert auto does not override manual.
- Quality pill reflects good/weak/poor.
- Audio sender remains active throughout every scenario (assert audio track never stopped).

## Required artifacts at plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/batch-diagc/

changes.md, scenarios.md, review.md, test-report.md, screenshots/{weak-connection-banner.png, audio-only-toggle.png, quality-pill.png}, independent-validation.md, decisions/<date>-*.md (or "none").

## Build + deploy

- Backend + frontend build PASS; backend tests PASS; new e2e PASS; full Run-1 + diag1 + diagb1 + diagb2 + diagc regression PASS — R8.1 must hold.
- pm2 restart meet-poc-fe meet-poc-be.

## Completion

COMMIT BEFORE STATUS: DONE. End with `STATUS: DONE — <reason>` + append `[projcore callback] diagc DONE <note>` to callbacks.md.
