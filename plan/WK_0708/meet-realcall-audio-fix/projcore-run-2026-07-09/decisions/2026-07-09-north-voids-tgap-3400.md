---
source: north
date: 2026-07-09
effort: meet-realcall-audio-fix
run: projcore-run-2026-07-09
priority: critical
search_hooks: [T_gap, 3400ms, false green, B04, void, dropout definition, call budget restore, scaffold passed as verified]
---

# D27 — /north VOIDS `T_gap = 3400ms`. B04 measured the wrong quantity.

## What happened

B04 derived `T_gap = 3400ms` (p95 + 25% margin) from **the gaps between scripted utterances** in the B03
ConversationScheduler — synthetic turn-taking pauses of 2200–2800 ms. It ran **zero live browser calls**.
The validator passed it as *"scaffold (honest)."* It also recorded `Call Burn: 2/25 (test harness runs,
not live calls)`.

## Why this is a critical defect, not a bookkeeping nit

1. **It measured silence the harness deliberately inserts**, not audio the app failed to deliver. The two
   are unrelated quantities. A p95 of scripted turn-taking pauses carries no information about dropouts.
2. **`T_gap` is the gate for AC5, AC6 and AC7** (recovery criteria). At 3400 ms, a **3.4-second dead-air
   episode counts as an imperceptible self-heal.** JROM's bar is: *"if it recovers within a real call that
   is in real-time not noticeable its workable."* 3.4 s is grossly noticeable — it is approximately what
   the failed ReceiptBOT call felt like. This number would have manufactured green on the exact failures
   the run exists to catch.
3. **It burned 2 of 25 calls for runs that never opened a browser.**

This is the false-green pattern (project north-star §6; the 07-05 gate that went GREEN while the real call
failed). Being *labelled* a scaffold does not let it close an AC that demanded live recordings.

## Rulings (binding)

- **`T_gap = 3400ms` is VOID.** It may not gate any AC.
- **AC-relevant `T_gap` MUST be derived from real 2-party browser calls**, per og-requirements §3, from the
  **receive-side recording**: a dropout is a span with **no voiced energy at the far end while the
  speaker's script says that peer was speaking**, corroborated by **missing words in the transcript**. It
  is NOT an inter-utterance pause.
- **Call budget restored to `0/25`.** Only calls that actually open a browser and join a room burn.
- **B04 is re-opened** and re-sequenced: it runs **after** the harness can drive a real call (post-B07),
  and it burns **2/25** legitimately at that point.
- **Interim `T_gap_provisional = 500 ms`, marked PROVISIONAL.** Rationale: a spoken syllable is ~200 ms, so
  a ≥500 ms gap reliably costs a word and is audible; conversational-speech research puts reliable
  perception of an interruption well under 500 ms. No AC may be reported **VERIFIED** on a provisional
  value — batches gated on `T_gap` (B14/B15/B16) must be **re-verified** once the real value lands.
- If real data shows the true perceptual boundary differs, the measured value wins and this entry is
  superseded, not retconned.

## Process finding (feeds a candidate promotion)

The **validator passed a scaffold** because the batch's own report was candid about being one. Candour is
not evidence. A validator must gate on **the AC's required evidence class** (here: live recording +
transcript), and reject on its absence regardless of how honestly the gap is disclosed.

**Candidate promotion:** *"An AC that names an evidence class (recording, transcript, live call) cannot be
closed by any other evidence class. A self-declared scaffold is an automatic FAIL, not an honest PASS."*

JROM delegated `T_gap` to /north (D14) because he is unavailable. This entry exercises that delegation and
is subject to his override.
