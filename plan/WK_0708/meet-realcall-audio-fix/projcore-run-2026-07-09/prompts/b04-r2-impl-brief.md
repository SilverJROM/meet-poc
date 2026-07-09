# B04 REOPENED (D27) — Real dual-browser T_gap derivation

## Why reopened
Prior T_gap=3400ms VOID: measured B03 scripted inter-utterance pauses, zero live browser calls.

## Required evidence class (scaffold = automatic FAIL)
- **Two real browser calls** that open + join a room (.140 <-> .123 or local dual Chromium)
- **Receive-side recording** analysis
- Dropout = span with **no voiced energy at far end WHILE script says that peer was speaking**, corroborated by **missing words in transcript**
- **NOT** inter-utterance pauses between scheduled turns
- Burn **exactly 2/25** only if both are real browser+room joins
- Write `decisions/T_gap.md` with real value OR document BLOCKED with measured attempt evidence if env cannot complete

## Provisional
Do not use 3400ms. Wiring-only provisional 500ms must not be reported as the real T_gap.

## B08 reminder (for later)
A = same-speaker attenuated-vs-normal far end; expect A≈r pre-fix in 2-party; normal ref BEFORE sweep.

## Handshake
Write prompts/b04-r2-proposed.md STATUS: PROPOSED. Wait APPROVED-PLAN.
Include: how dual Chromium/room is driven; how dropout is measured from recording+transcript; burn accounting.
