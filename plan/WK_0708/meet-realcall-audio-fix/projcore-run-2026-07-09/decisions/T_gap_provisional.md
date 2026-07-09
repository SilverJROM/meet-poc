# T_gap_provisional = 500 ms (PROVISIONAL — wiring only)

**Status: PROVISIONAL** (north D27)  
**NOT an AC-closing value.** No AC may be reported VERIFIED against this.

## Value
`T_gap_provisional = 500ms`

## Rationale (interim)
A spoken syllable is ~200ms; a ≥500ms gap during scripted speech reliably costs a word and is audible. Conversational-speech research puts reliable perception of interruption well under 500ms.

## Rules
1. May be used only to **wire** recovery/detection code paths (B14/B15/B16 thresholds).
2. **No AC VERIFIED** on this value.
3. When real `T_gap` lands (B04 post-B07 live calls), **re-verify** B14/B15/B16 (and any AC that gated on T_gap).
4. If real data differs, measured value **wins** and this entry is superseded (not retconned).

## Dropout definition (must match D27)
Far-end no-voiced-energy **during** scripted peer speech + missing transcript words. Never inter-utterance pauses.
