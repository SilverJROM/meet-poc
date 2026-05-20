# Batch I (diagi / DR-25) — Projcore Independent Validation

**Verdict: PASS — VERIFIED + DEPLOYED (before freeze, per JROM "best version for the call").**

| Check | Result |
|---|---|
| Commit | 23135a9 (media.service deviceId/facingMode exclusivity, device-dialog, lobby+in-call) |
| `npm test -w backend` | 114 passed / 1 skipped |
| `npm run build` | PASS (codex, under freeze) |
| diagi e2e (with correct E2E_BASE_URL=:4700) | **2/2** — lobby picker sends exact deviceId / mobile flip sends facingMode only; in-call hot-swap keeps audio sender priority high (DR-13 preserved) |
| Regression (fixc2 device-modal + fixc3 call-path) | PASS |
| Deployed | fresh fe rebuild + clean restart (env clean), login 200 / TURN live / public URL 200 — **DR-1..25 now live for the 8pm call** |

## Root cause fixed

facingMode was overriding the picker's exact deviceId (+ lobby preflight ignored selected IDs) → selecting a camera/mic did nothing on multi-cam/mobile. Fix: picker → exact deviceId wins (incl. mobile); flip front/back → facingMode wins, mutually exclusive; lobby + in-call; mic swap keeps DR-13 audio-priority.

## Requirement closure

| Req | Status |
|---|---|
| DR-25 fix camera/mic device switching | **VERIFIED** (e2e) + DEPLOYED. Real multi-cam/mobile front-back is JROM's device confirm (fake devices can't fully prove hardware switching). |

## Minor flag (test-only, not blocking, not deployed-app-affecting)

The diagi spec hardcodes `process.env.E2E_BASE_URL || 'http://localhost:4710'` — wrong fallback port (live FE is :4700), so the in-call test fails in a normal `npm test` run without the env override. Have codex change the fallback to :4700 (or use the config baseURL) in a later touch (e.g., during Z cleanup). Does NOT affect the deployed app.

## Status

DR-1..25 all VERIFIED + deployed. Only DR-24 (Z modularization audit, FINAL) remains. Conn-run is feature-complete.
