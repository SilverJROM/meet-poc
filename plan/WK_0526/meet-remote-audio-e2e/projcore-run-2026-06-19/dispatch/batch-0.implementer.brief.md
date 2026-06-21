<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-0 VALIDATION (independent): local 2-client mutual audio + rig soundness

Batch ID: batch-0
Role: validator (codex55 / gpt-5.5). You are the USER's clone — validate as JROM would, from the user's seat. NOT the implementer's rubber stamp. Anchor to og-requirements.md R1 + the Measurement standard, not to grok's diff.
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-remote-audio-e2e/projcore-run-2026-06-19
Plan: that dir's implementation-plan.md · og-requirements.md (R1 + Measurement standard) · north-star.md

What the implementer (grok) CLAIMS DONE:
- DEV brought up (PM2 meet-poc-be+fe; :4720/health 200; :4700 proxy).
- A reusable rig `e2e/fixtures/audio-rig.ts` + a shared measurement module + tone WAVs `e2e/fixtures/audio/tone-440.wav` (host) / `tone-880.wav` (guest), test under `e2e/tests/remote-audio/`.
- Two LOCAL Chromium clients joined throwaway room `3073e6a60221` (knock→admit via `.knock-toast`+Admit), proved MUTUAL audio: host measures guest tone AND guest measures host tone, dual-criteria.
- Artifacts under run-dir `batch-artifacts/batch-0/` (changes.md, test-report.md, metrics/b0-mutual-metrics.json, screenshots/, review.md, scenarios.md, decisions/).

Reported metrics (SCRUTINIZE THESE):
- hostMeasuresGuest: energyRmsPeak=0.0093, energyAboveFloorMs=5120, inboundBytesDelta=329, pass=true
- guestMeasuresHost: energyRmsPeak=0.0096, energyAboveFloorMs=5120, inboundBytesDelta=405, pass=true

Your validation tasks (§1.11 Q0 + Q1-Q7, UI-PROOF):
1. **Q0 coverage/closure:** Does R1 ("DEV up and hostable; host opens /room/:id in-call view; room id captured") observably hold? Map each acceptance criterion to evidence or mark GAP.
2. **Magnitude scrutiny (the key concern):** energyRmsPeak ~0.009 (~-38 dBFS) and inboundBytesDelta 329/405 are LOW. Determine whether this genuinely proves audible mutual audio or is a near-floor / Opus-DTX / comfort-noise false positive. Specifically:
   - Inspect the measurement module: how is the silence FLOOR calibrated? Is the pass threshold gameable (floor set so low that silence passes)? Is inboundBytesDelta a per-interval or whole-window delta?
   - Verify distinct-tone ATTRIBUTION: does host actually receive the 880Hz guest tone (and vice-versa), not its own echo? (e.g. spectral check or that each side's inbound differs from its outbound.)
3. **Re-run the rig FRESH yourself** (independent observation, UI proof): run grok's test, observe the rendered 2-tile in-call view, and confirm your OWN measurement of mutual audio. Capture a screenshot to `batch-artifacts/batch-0/validation-screenshots/`. If you can, also sanity-check that with SILENCE/no-tone the rig correctly FAILS (negative control) — a rig that passes on silence is invalid.
4. **Scope/cleanliness:** no TEST_ROOM01 touch; no TODO/shim/deadcode (deferral OFF); secrets not echoed.

Verdict:
- If R1 holds AND the mutual-audio proof is robust (real audio, floor not gamed, attribution correct) → emit REPRO-CLEARED-ON-LOCAL with a one-line "why" (use this state to mean VALIDATED-PASS for this build batch). Write `batch-artifacts/batch-0/independent-validation.md` with your evidence + the negative-control result.
- If the proof is weak/gameable/wrong-level or R1 has a GAP → emit REPRO-STILL-PRESENT (= VALIDATION-FAIL) with the precise gap(s) so the implementer can fix. Verifier ≠ fixer: SPECIFY the gap, do not edit grok's code.

Required artifact: `batch-artifacts/batch-0/independent-validation.md`.

---
## Streaming-order mandate
**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). Not the first sentence — the first TOOL CALL, BEFORE any prose tokens stream. Append first, prose after.**

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0526/meet-remote-audio-e2e/projcore-run-2026-06-19/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh validator batch-0 <STATE> "<note>"
```
The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)
```
validator states: WORKING | REPRO-CONFIRMED | REPRO-FAILED | REPRO-CLEARED-ON-LOCAL | REPRO-STILL-PRESENT | BLOCKED | NEEDS-INFO
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO

NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```
(You are the VALIDATOR — use ONLY the validator states above. The implementer line is present solely to satisfy the dispatch gateway's contract check.)
Use WORKING for non-terminal progress. For THIS build-batch validation: REPRO-CLEARED-ON-LOCAL = VALIDATED-PASS, REPRO-STILL-PRESENT = VALIDATION-FAIL.

## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+validator[[:space:]]+batch-0[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo (human-readable mirror only)
End your reply with `STATUS: <STATE> — <note>`. Callback wins if they differ.
---
(end of validator brief)
