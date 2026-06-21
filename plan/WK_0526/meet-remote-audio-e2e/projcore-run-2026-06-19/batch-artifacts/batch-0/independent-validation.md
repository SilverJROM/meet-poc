# Batch-0 Independent Validation

Validator: codex55  
Date: 2026-06-19 UTC  
Verdict: **REPRO-CLEARED-ON-LOCAL**

## Q0 — R1 Coverage / Closure

R1 contract: DEV is up and hostable; host can create/open a throwaway room reachable by a participant; `/health` 200; host browser at `/room/:id` shows in-call view; room id captured.

| Acceptance item | Evidence | Result |
|---|---|---|
| DEV backend health 200 | `curl -fsS http://localhost:4720/health` returned `{"ok":true}`. | PASS |
| DEV frontend hostable | `curl -fsSI http://localhost:4700/login` returned `HTTP/1.1 200 OK`. | PASS |
| Local PM2 processes up | `pm2 jlist` showed `meet-poc-be online` and `meet-poc-fe online`. | PASS |
| Throwaway room captured | Fresh validator rerun room `dea7993ad2f7`; validation-control room `ccd86f7dad46`. Existing implementer room `3073e6a60221` was also captured for B1. | PASS |
| Host opens `/room/:id` in-call view | Independent screenshot: `validation-screenshots/b0-validator-two-tile-in-call.png`, rendered in-call with `validator-host` + `validator-guest`. | PASS |

## Fresh Rerun

Command:

```bash
E2E_BASE_URL=http://localhost:4700 npm test -w e2e -- tests/remote-audio/b0-local-mutual-audio.spec.ts --config=playwright.config.ts --workers=1
```

Result: **PASS**, 1 test passed.

Fresh metrics from room `dea7993ad2f7`:

- host measured guest: `energyRmsPeak=0.009721538`, `energyAboveFloorMs=5120`, `inboundBytesDelta=329`, `pass=true`
- guest measured host: `energyRmsPeak=0.009608891`, `energyAboveFloorMs=5120`, `inboundBytesDelta=486`, `pass=true`

## Measurement Scrutiny

Implementation inspected: `e2e/fixtures/audio-rig.ts`.

- Silence floor is a fixed RMS threshold, default `0.002`; B0 calls use `floor=0.0015`.
- PASS requires both `energyAboveFloorMs >= 3000` and `inboundBytesDelta > 0`.
- `inboundBytesDelta` is measured within the sampling window as the max observed `bytesReceived` delta between sampled inbound-rtp stats, not a full call lifetime total.
- The reported RMS around `0.009` is low in absolute dBFS terms, but it is about 6x above the B0 floor and was sustained for the full 5.12s measured window.

Independent validation-control evidence:

- Positive pre-mute metrics in `validation-screenshots/positive-pre-mute-metrics.json`:
  - host measured guest: `energyRmsPeak=0.009345542`, `energyAboveFloorMs=5120`, `inboundBytesDelta=326`, `pass=true`
  - guest measured host: `energyRmsPeak=0.009609304`, `energyAboveFloorMs=5120`, `inboundBytesDelta=405`, `pass=true`
- Negative muted-control metrics in `validation-screenshots/negative-control-muted-metrics.json`:
  - host measured muted guest: `energyRmsPeak=0.000002612`, `energyAboveFloorMs=0`, `inboundBytesDelta=160`, `pass=false`
  - guest measured muted host: `energyRmsPeak=0`, `energyAboveFloorMs=0`, `inboundBytesDelta=15`, `pass=false`

This is the key false-positive discriminator: inbound bytes can still rise while muted, but the energy criterion prevents that from passing.

## Distinct-Tone Attribution

The implementer harness uses distinct fake audio files (`tone-440.wav` for host, `tone-880.wav` for guest) and measures the remote stream, but its headline pass condition is RMS + inbound bytes, not spectral attribution.

Validator added an independent validation-only spectral sample during the control run. Results in `validation-screenshots/negative-control-muted-metrics.json`:

- host receiving guest: dominant peak `878.90625 Hz`, matching the guest 880 Hz tone.
- guest receiving host: dominant peak `445.3125 Hz`, matching the host 440 Hz tone.

This closes the attribution concern for B0 local mutual audio: each side received the opposite party's distinct tone, not only local echo or comfort noise.

## Scope / Cleanliness

- No evidence of `TEST_ROOM01` / `testroom01001` use beyond explicit guardrail checks and written "do not use" references.
- No production code touched by the implementer batch; B0 changes are e2e rig/fixture files and artifacts.
- No secret values observed in artifacts or logs; only secret file names/runtime sourcing are referenced.
- Grep found no active TODO/FIXME/shim/deadcode in the B0 rig/test scope.

## Final

**REPRO-CLEARED-ON-LOCAL** — R1 holds on DEV, the local two-client rig passed independently, the low RMS is materially above calibrated/muted silence, inbound-byte-only false positives are rejected, and spectral validation confirmed opposite-party tone attribution.
