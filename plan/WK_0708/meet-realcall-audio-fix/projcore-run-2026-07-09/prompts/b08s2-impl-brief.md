# B08S-2 — Evidence spine 2/2: receive-side recorder + transcript adapter

**Role:** implementer L2 (haiku)  
**§4b:** impl L2, val L2 (codex55), delib no, redteam budget  
**Deps:** B08S-1 VERIFIED, B02 VERIFIED

## Why
Recording is the arbiter. B08S-1 joins dual browsers. This batch must produce a **receive-side WAV + transcript** path into RecordingArbiter.

## Gaps (binding)
1. Legacy records **.webm**; RecordingArbiter parses **WAV** → transcode/capture WAV.
2. App recorder `/upload` is owner-gated + open-session-gated and **rejects silently** — harness must capture receive-side audio itself (not rely on app upload as sole arbiter source).

## Scope
- Harness module that, on a dual-browser call (B08S-1), captures far-end audio to a WAV path
- Transcript of known fixed-clock words (whisper or banked path if already available)
- Feeds RecordingArbiter.analyzeRecording
- Closes **no AC**

## Acceptance
Live or tightly-stubbed proof: dual-browser call yields receive-side WAV arbiter can parse + transcript contains known scripted words. Prefer minimal burn; log ledger IDs.

PROPOSED first → APPROVED-PLAN. Callbacks to callbacks.md.
