## Accepted: Batch-0 — STATUS: PASS
HEAD: (harness files uncommitted on branch feat/remote-audio-e2e-20260619; rig under e2e/fixtures/audio-rig.ts + e2e/tests/remote-audio/ + e2e/fixtures/audio/tone-440.wav,tone-880.wav)
Branch: feat/remote-audio-e2e-20260619
Implemented: DEV brought up (PM2 meet-poc-be+fe, :4720/health 200, :4700 proxy). Reusable Playwright rig audio-rig.ts + shared measurement module (WebAudio energy + getStats inbound-rtp dual-criteria, distinct 440/880 tone WAVs). Local 2-client mutual audio GREEN + independently re-validated by codex55 (neg-control fails on silence; spectral attribution 878.9Hz confirmed).
Req#s closed: R1 VERIFIED.
Open in matrix: R2 (B1 remote join), R3, R4, R5, R6, R7.
Reuse for B1: throwaway room id 3073e6a60221 (DEV); shared rig e2e/fixtures/audio-rig.ts + measurement module; join path = knock-toast + Admit (exact selectors in batch-0/changes.md). Seed login reads INITIAL_PASSWORD.txt at runtime.
Gotchas: fake-tone WAVs are low-amplitude (~-38dBFS) but ~6x floor — real. inboundBytesDelta is per-window max delta, not lifetime. Energy criterion (not bytes) is the silence discriminator.
