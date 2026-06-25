# B1 Validation Report — Recording Saves Through Close Room
**Validator:** Independent VALIDATOR (verifier ≠ fixer, sonnet)
**Date:** 2026-06-25 03:59 PHT (UTC+8)
**Env:** localhost:4700 (deployed bundle, same as voice.silverjrom.app)

## Harness Invocation

```
node e2e/scripts/capstone-record-host.mjs --peers 0 --record-ms 30000
```

- `--peers 0`: solo smoke (no Peer2 required); exercises the fix path without cross-machine coordination
- `--record-ms 30000`: 30-second window (deploy smoke, not the B5 long-call capstone)
- Path exercised: Login → Join AGENTROOM → More → Record → **Leave call → Close room** (while recording)

## Harness Output (key lines)

```
[CAPREC] IN-CALL (Leave button present)
[CAPREC] remote audio publishers = 0
[CAPREC] peers ready = 0
[CAPREC] record started? isRecording= true
[CAPREC] recording for 30s...
[CAPREC] ending call WHILE recording (Leave call -> Close room) — exercises flushRecordingForExit
[CAPREC] clicked Close room — waiting for "Saving recording" + upload to finish
[CAPREC] upload settled
[CAPREC] done; closing
```

Note: `[signaling] send while NOT OPEN type=recording-state readyState=null` appeared (pre-join signal, benign — recording still started confirmed by `isRecording= true`).

## Backend Log Evidence

```
2026-06-25T03:59:49: [rec] saved 2026-06-25T03-59-49-360Z_75437bc9-396b-4b8b-b8e9-a2e0aba2277f_d98896162f09_AGENTROOM_4d6b08.webm (506.6 KB)
2026-06-25T03:59:49: [rec] saved 2026-06-25T03-59-49-363Z_75437bc9-396b-4b8b-b8e9-a2e0aba2277f_d98896162f09_AGENTROOM_recorder_9f3eb1.webm (507.2 KB) [per-user]
```

Both lines are stamped **2026-06-25** (today), session UUID `75437bc9`, room `d98896162f09` (AGENTROOM). This is new — the prior `[rec] saved` lines were all `2026-06-23`.

## Files on Disk

```
-rw-rw-r-- 1 agjrom agjrom 519399 Jun 25 03:59 recordings/2026-06-25T03-59-49-363Z_75437bc9-..._AGENTROOM_recorder_9f3eb1.webm
-rw-rw-r-- 1 agjrom agjrom 518767 Jun 25 03:59 recordings/2026-06-25T03-59-49-360Z_75437bc9-..._AGENTROOM_4d6b08.webm
```

Both ~507 KB (substantive for 30 s of fake audio). Files are present and valid-sized.

## Pre-fix Baseline

The broken baseline (HRIS_TOJ incident): host ended via Close room, zero `[rec] saved` fired, recording lost. Last pre-fix `[rec] saved` was `2026-06-23T23:18:01` (prior test run, different session UUID, with peers).

## Verdict

**PASS.** Recording started in-call, host ended via Close room (the `flushRecordingForExit` path), `[rec] saved` fired for both the session track and the per-user host track, files exist on disk with correct size. The HRIS_TOJ close-room-loses-recording regression is closed.

---

STATUS: VALIDATED
