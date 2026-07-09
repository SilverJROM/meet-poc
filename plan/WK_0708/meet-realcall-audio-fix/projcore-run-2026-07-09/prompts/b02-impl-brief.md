# Batch B02 — Implementer (L2 haiku)

Batch ID: B02
Title: Recording/transcript arbiter and third verdict
Plan: .../plan.md (read B02 row + BINDING CORRECTIONS for A definition)
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09
Branch: batch-01-diagnosis-2026-07-08

## §4b
- impl_tier: L2 (haiku)
- validator_tier: L2 (codex55)
- deliberation: no
- redteam: yes (budget)

## Scope
Build shared evidence contract for:
1. Receive-side recordings
2. Voiced-segment RMS/LUFS measurement
3. Transcript extraction hooks
4. PASS / FAIL / INVALID result writing
5. Stats may be logged but never decide PASS alone

**Binding A def (north):** A will later use same-speaker normal-vs-attenuated far-end loudness — design the loudness API so that ratio of two voiced measurements is first-class.

## Acceptance
Synthetic known WAV round-trip produces recording + transcript + RMS/LUFS summary + an INVALID sample when stimulus verification is missing.

## Handshake
First: STATUS: PROPOSED (files, approach, estimate). Wait APPROVED-PLAN.
Then implement. Emit [projcore callback] impl B02 STATUS: DONE — ...

Reuse e2e/harness/ where sensible. Atomic commits only for B02.
