# STATUS: PROPOSED — D28+D29 re-plan (projcore custody)

**Run:** projcore-run-2026-07-09 · **OVM:** workflow 136 · **Branch:** batch-01-diagnosis-2026-07-08

## Mechanism diagnosis
1. TURN/ICE is not the 07-08 cause (one bundled PC; she could hear JROM).
2. Frozen outboundAudioLevel is ambiguous (capture-dead vs sender-dead).
3. R1/856104f is **blind** on sender-dead (capture energy advancing → classifyMicCapture returns working before variance check). Independent B13W watchdog required.
4. Recording-as-arbiter was required without a spine to produce recordings — B08S-1/B08S-2 fill that hole.
5. Real-call T1 needs diagnostics emission of the four counters, not harness-only readers.

## Plan shape (32 batches; B01–B07 banked VERIFIED)
| Phase | Batches | Notes |
|---|---|---|
| AC15 product early | **B08A-1** (reader+diagnostics emit), B08A-2 (discriminator+injection) | Zero live calls; L3/L3 |
| Parallel archaeology | B08X read-only on 652c1475 | Non-blocking; never mutate |
| Harness integrity | B00F (F2 false-PASS floor + F4 vitest port) | Before sweep |
| Evidence spine | **B08S-1**, **B08S-2** | Before ANY live AC |
| AC15 live | B08A-3 | Only place AC15 VERIFIED |
| T_gap real | B04-real | After spine; burns 2/25 |
| Gain path | B08 → B09 (absolute loudness + AC17) → B10 (AC3) → B11/B12 | Never local publisher |
| AC4 | **B13W** (watchdog) → **B13** (branch remedy) | Sender remedy ≠ mic reacquire |
| Recovery/live | B14–B21 + B16R AC16 + B20T AC18 LOW | |

## Files / ownership
- Artifacts: plan.md, queue-batches.md, og-requirements.md (AC15 D29), decisions D28+D29
- First impl: B08A-1 sonnet L3 (session x-01_impl_sonnet_meet) — brief amended for diagnostics emit
- Validator for B08A-1: opus L3 (never sonnet)

## Risks
- codex55 ~3% headroom — fall open to sonnet for L1/L2 val only when sonnet did not implement
- B08S may need further split if >30min; must not skip
- Do not report AC15 VERIFIED at B08A-2

## Estimate
- Planning custody complete; B08A-1 ~25min then sequential drain
- Live ACs blocked until B08S lands

## Tier confirm
- Capture/sender batches: impl L3 / val L3 / delib yes / redteam standard
- Spine/harness: L2 / L2

## Self-hygiene
- Floor refresh ~6 batches; first hard checkpoint after B08A-3

Awaiting main-agent / continued autonomous APPROVED-PLAN to keep draining B08A-1 (brief already D29-amended).
