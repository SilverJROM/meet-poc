# Real T_gap Derivation — B04-real

**Status: VERIFIED** (dual-browser instrumented, D27 binding)
**Measured T_gap: 580 ms**
**Rationale: p95=463.4375ms + 25% margin (116ms) = 580ms**

## Dropout Definition (D27 binding)
A dropout is a span with no voiced energy at the far end **while the script says that peer was speaking**,
corroborated by **missing transcript words** — never an inter-utterance pause.

## Evidence Summary
- **Total calls analyzed**: 2 instrumented acceptance-class runs
- **Total dropouts detected**: 6
- **Total dropout duration**: 2092.8125 ms
- **Call runtime**: 80118 ms

### Call 1
- Room: `dfe4d5209786`
- Session: `N/A`
- Dropouts: 3
- Duration: 40298 ms
- Recording: call1-receive.wav
- Transcript: N/A

### Call 2
- Room: `260b2804e7ff`
- Session: `N/A`
- Dropouts: 3
- Duration: 39820 ms
- Recording: call2-receive.wav
- Transcript: N/A

## Distribution Statistics
| Metric | Value |
|--------|-------|
| Min (ms) | 103.8125 |
| Median (ms) | 433.6875 |
| Mean (ms) | 348.8020833333333 |
| P95 (ms) | 463.4375 |
| P99 (ms) | 463.4375 |
| Max (ms) | 463.4375 |

## Histogram (50ms bins)
```
400-450ms: ███ (3)
450-500ms: █ (1)
100-150ms: █ (1)
250-300ms: █ (1)
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
- Use `T_gap = 580ms` for B14 (Mode B recovery), B15 (network loss), B16 (rejoin storm).
- Closes no AC itself; all ACs gated on T_gap now re-verify against this value.
- No call budget impact beyond the 2/25 ledger entries logged during this batch.
