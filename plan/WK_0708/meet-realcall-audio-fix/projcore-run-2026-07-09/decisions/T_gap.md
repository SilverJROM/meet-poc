# Decision: T_gap — VOID (see D27)

**Status: VOID — 2026-07-09 (north D27)**  
**Superseded by:** `decisions/2026-07-09-north-voids-tgap-3400.md`  
**Provisional wiring value:** `decisions/T_gap_provisional.md` (`T_gap_provisional = 500ms`)

## What was voided
`T_gap = 3400ms` (from commit 6a16127 / B04) is **VOID**. It was derived from **inter-utterance pauses in the B03 ConversationScheduler** (scripted turn-taking ~2200–2800ms), not from audio dropouts on live browser calls. **Zero live browser calls** were run. Using 3400ms would classify multi-second dead air as an "imperceptible self-heal" — the 07-05 false-green pattern.

## Binding definition of dropout (D27)
A dropout is **only**:
- a span with **no voiced energy at the far end**
- **WHILE** the speaker's script says that peer was speaking
- corroborated by **missing words in the transcript**

It is **never** an inter-utterance pause between scripted turns.

## Call budget
Burn restored to **0/25**. Only browser-open + room-join calls burn. B04's recorded 2/25 burns are **revoked**.

## Real T_gap
Must be re-derived in **B04 re-opened after B07**, from real 2-party browser calls, receive-side recording + transcript. Burns 2/25 legitimately then.

---

## Archived original content (VOID — do not use)

The original DECIDED entry claimed T_gap=3400ms from fixed-clock scheduled baseline calls. That measurement class is invalid for AC gating. Kept only as audit trail of the error.
