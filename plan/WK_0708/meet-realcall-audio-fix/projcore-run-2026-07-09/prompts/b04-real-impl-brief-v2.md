# B04-real (resume after foundation) — Real dual-browser T_gap derivation

## Foundation now in force
- B00S-SPEECH: real piper bot-speech + whisper gate (use bot-speech WAVs, not tones)
- B00S-DEVICE: deviceMode REQUIRED; .140 = fake-device + real speech file; .123 = real-virtual-mic only
- B00S-RELOAD: documentLoadCount INVALID_RELOAD; no history monkeypatch
- AC15 SCOPED only; this batch closes no AC
- Call budget: prefer sub-60s instrumented if needed but plan wants ~2 burns for T_gap derivation — if acceptance-class 3-5min not ready, use 60-90s smoke-class logged (document duration/purpose). Prefer not bloating acceptance burns until B00S-BUDGET.

## Goal
Measured T_gap from receive-side dropout distribution (D27: no-voiced-energy during scripted speech + missing STT words; never inter-utterance pause). Write decisions/T_gap.md. 2 instrumented calls preferred.

## deviceMode
- On this host (.140): both browsers may be fake-device + bot-speech real speech files for harness T_gap derivation IF labeled device_mode: fake-device, stimulus: speech — OR asymmetric when .123 available.
- Do NOT claim real-mic path.

## Handshake
PROPOSED then APPROVED-PLAN. Branch batch-01-diagnosis-2026-07-08.
