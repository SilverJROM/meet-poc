# Real T_gap Derivation — B04-real

**Status: MEASURED** (dual-browser instrumented, D27 binding, validator to confirm)
**Measured T_gap: 358 ms**
**Rationale: p95=285.02083333333576ms + 25% margin (72ms) = 358ms**

## Dropout Definition (D27 binding)
A dropout is a span with no voiced energy at the far end **while the script says that peer was speaking**,
corroborated by **missing transcript words** — never an inter-utterance pause.

## Evidence Summary
- **Total calls analyzed**: 2 instrumented acceptance-class runs
- **Total dropouts detected**: 17
- **Total dropout duration**: 3456.770833333344 ms
- **Call runtime**: 84051 ms

### Call 1
- Room: `4d88b085d514`
- Session: `N/A`
- Dropouts: 6
- Duration: 40703 ms
- Recording: call1-receive.wav
- Transcript: call1-transcript.json
- STT words recognized: 3 (D27 corroboration)

### Call 2
- Room: `efae5715d3ce`
- Session: `N/A`
- Dropouts: 11
- Duration: 43348 ms
- Recording: call2-receive.wav
- Transcript: call2-transcript.json
- STT words recognized: 4 (D27 corroboration)

## Distribution Statistics
| Metric | Value |
|--------|-------|
| Min (ms) | 6.9375 |
| Median (ms) | 217.06250000000364 |
| Mean (ms) | 203.33946078431435 |
| P95 (ms) | 285.02083333333576 |
| P99 (ms) | 285.02083333333576 |
| Max (ms) | 285.02083333333576 |

## Histogram (50ms bins)
```
200-250ms: █████████ (9)
250-300ms: ████ (4)
150-200ms: █ (1)
0-50ms: █ (1)
100-150ms: █ (1)
50-100ms: █ (1)
```

## Device Provenance
- **Device mode**: fake-device (both browsers, B00S-DEVICE binding)
- **Stimulus**: real bot-speech piper WAV fixtures (B00S-SPEECH binding)
- **Spine**: B08S-1/B08S-2 dual-browser call driver + receive-side recorder
- **Call driver**: documentLoadCount INVALID_RELOAD (B00S-RELOAD binding)

## Binding Rules (from decisions/T_gap_provisional.md)
1. May be used only to wire recovery/detection code paths (B14/B15/B16 thresholds).
2. ACs may now be VERIFIED against this real value (provisional 500ms is void).
3. If future data diverges, measured value wins and this entry is superseded.

## Usage Notes
- Use `T_gap = 358ms` for B14 (Mode B recovery), B15 (network loss), B16 (rejoin storm).
- Closes no AC itself; all ACs gated on T_gap now re-verify against this value.
- No call budget impact beyond the 2/25 ledger entries logged during this batch.
