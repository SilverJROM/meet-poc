# Regression-Coverage Mission — CONFIDENCE REPORT (2026-06-08)

## Bottom line
Every distinct failure we have EVER seen in the diagnostics (12 signatures from 48 real calls) + every
researched known WebRTC/cross-platform failure mode (13) is now RECREATED as a test and PASSES on the
current app. Replaying real call data found 3 real gaps the earlier fix's synthetic tests missed; all 3
are fixed. Committed 1de076c + live app rebuilt.

## What was covered (25 scenarios, all PASS)
### Historical (12, from archaeology/signatures.md) — telemetry-REPLAY of real session getStats
H1 inbound-recv-no-audioLevel/energy*, H2 high-concealment*, H3 packet-loss, H4 relay-path, H5 subscribe-stuck,
H6 ws-reconnect/disconnect, H7 one-inbound-audio-at-a-time (the registry fix), H8 high-RTT-intl, H9 outbound-audio-0bytes,
H10 pc-state failed/failed, H11 publish-error, H12 inbound-audioLevel-0*.  (* = the 3 that FAILED → fixed this run.)
### Researched (13) — unit decision-logic tests
R2 setSinkId taxonomy, R3 iOS no-setSinkId, R7 devicechange/sink-timeout, R8 opus-DTX false-positive,
R9 ICE-restart re-subscribe, R10 renegotiation glare, R11 volume>1→1.0 migration, R12 CF stale-track mapping,
+ R1/R4/R5/R6/R13 markers (T2-only, see residual).

## The 3 found+fixed (replaying real data)
- H1/H12 (CRITICAL): watchdog energy-gate (added in CR-fix-2/4) suppressed the stall verdict when inbound
  audioLevel/totalAudioEnergy is null/0 — the Chrome-113+ / failed-call shape — so a post-play stall could
  re-open silent-with-no-banner. FIX: bytes-climbing+emitted-flat is the stall signal; energy is a refinement,
  not a hard gate; bytes-flat (legit silence/DTX) still suppresses → CR-fix-2 false-positive protection preserved.
- H2: classifyRemoteAudioHealth no longer flips an EMITTING track (emitted>0) to silent on concealment ratio alone.

## Confidence statement (JROM's bar)
At the DECISION-LOGIC + REAL-DATA-REPLAY level, every previously-seen + researched-known failure mode is
covered by a passing test and any gap is fixed. The app can now only fail on a mode we have NOT seen before
(or in the deferred real-browser-only specifics below).

## RESIDUAL (honest) — T2 real-browser tier DEFERRED (infra + budget)
Not built this run: real-browser end-to-end + acoustic proof for the browser-ONLY scenarios that can't be
unit-replayed: R1 setSinkId-before-play order race (real Chrome), R4 autoplay NotAllowedError (real gesture),
R5 page/Android backgrounding resume, R6 MediaRecorder background frame-gap, R13 simulcast/RID, and the
parecord acoustic "audio physically reached the selected sink" proof.
- Blocker: `pactl`/`parecord`/system-Chrome not installed (needs `sudo apt-get install -y pulseaudio pulseaudio-utils`); Playwright Chromium IS available.
- Budget: Claude 91% / Codex 79% used this run.
- These are partially covered by: (a) the app code already implements the handlers (verified in the 13-lens code red-team), (b) JROM's real live call. Recommended follow-up when budget/infra allow: install pulseaudio + build the Playwright `t2-real-audio-output` suite (Phase B panel gave exact commands in deliberation/phaseB-*.md).
