# P3-LIVE-02 validation (coord gate)

**Commit:** 2966e05  
**Verdict:** **BLOCKED (partial)** — audioinput clause MET; receive-energy clause NOT MET  
**Burns:** 0 · **CAP:** 25 · **P3 PASS:** still 0/25

## Q0–outcome checks

| Clause | Result | Evidence |
|--------|--------|----------|
| .123 Chrome enumerates audioinput | **PASS** | module-remap-source; headless gUM ok; Xvfb disproven |
| Both legs join + publish live SFU | **PASS** | sfu-publish both; waitForPublishedAudioBytes |
| Receive-side energy WAV | **FAIL** | INVALID_NO_PC; pcCount=0; RTCPeerConnection restored to native mid-call |
| acceptanceAttempt:false / no burn | **PASS** | callBurnCount stayed 0; 5 smokes cleaned |
| No app code | **PASS** | e2e/harness + plan only |

## Mechanism notes (accepted)

- Root cause for audioinput: Chrome filters `device.class=monitor`; fix = `module-remap-source` as `device.class=filter`.
- New blocker: capture hook `window.RTCPeerConnection` wrapper clobbered mid-call (zone.js leading suspect). Documented in `decisions/2026-07-10-p3-live-02-invalid-no-pc.md`.
- Room DELETE on throw path leak noted (manual cleanup done); follow-on optional.

## Gate decision

- Do **not** claim DONE/PASS for Phase3 smoke.
- Do **not** burn acceptance.
- Follow-on **P3-LIVE-03**: fix INVALID_NO_PC receive capture on split-host path; re-smoke with receive energy; acceptanceAttempt:false.
