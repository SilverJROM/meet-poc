# B08A-3: AC15c live sender-liveness invariant

Batch ID: B08A-3
Run-dir: plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09
Branch: batch-01-diagnosis-2026-07-08 (continue; atomic commits)

## §4b
- impl_tier: **L3** (you = sonnet / implementer.L3)
- validator_tier: L3 opus
- deliberation: yes → **CONVERGED** (see decisions/2026-07-09-b08a3-deliberation.md)
- redteam: yes (standard)

## North-star / AC
AC15 live clause ONLY. Discrimination already closed in B08A-2. AC15 is VERIFIED only when far-end transcript proves speech landed AND all four counters advanced during that window.

## Banked APIs (use; do not reimplement)
- `SfuClientService.getOutboundLiveness()` / `extractOutboundLiveness` (B08A-1, 0ca6670/d7edd39)
- `classifySenderLiveness(window)` (B08A-2, 51d0d18) — healthy speech → `both-advancing`
- B08S-1 CallDriver `joinDualBrowserCall` / dual-browser harness
- B08S-2 receive-side + `generateScriptTranscript` / ledger `incrementCallBurn`
- Sender-dead injection is **out of scope** (B13W)

## Required outcome
1. One live dual-browser call (burn **exactly 1** via call-ledger).
2. During scheduled speech, sample sender liveness ≥2 points → window.
3. Assert all four advance: totalAudioEnergy, totalSamplesDuration, packetsSent, bytesSent.
4. Assert `classifySenderLiveness` === `both-advancing`.
5. Far-end transcript evidence exists (scriptExpected labeled OK if STT not wired — document in changes.md).
6. Real test(s) ~1-3; tight diff; no synthetic counter stubs.
7. changes.md Codex-style at validation/b08a3-changes.md or prompts/.

## Handshake (mandatory)
First output: clear **PROPOSED** (mechanism, files, estimate, risks, tier confirm L3). Then **STOP** and wait for `APPROVED-PLAN`. No code before APPROVED-PLAN.

## Callbacks
`[projcore callback] impl B08A-3 STATUS: PROPOSED | WORKING | DONE | BLOCKED — <note>`
Append same line to run-dir callbacks.md when DONE.

## Guards
- Pre-live deferral OFF
- 95/5 atomic <30min non-test work
- Do NOT mark AC15 closed yourself — validator only
- Verifier ≠ fixer — you implement only
- THREE spine guards already in B08S-2 — do not break RTC config / ontrack / synthetic WAV

Read first:
- decisions/2026-07-09-b08a3-deliberation.md
- decisions/2026-07-09-b08a2-empirical-findings.md
- plan.md row B08A-3
- e2e/harness/call-driver.ts, call-ledger.ts, receive-side-recorder.ts
- frontend mic-energy.ts classifySenderLiveness + sfu-client getOutboundLiveness

Start with PROPOSED only.
