# B5 Capstone Validation — Real Long Call, Recording Saves Through Close Room
**Validator:** Independent VALIDATOR (verifier ≠ fixer, sonnet)
**Date:** 2026-06-25 05:06 PHT (UTC+8)
**Session UUID:** `a88ef4ef-ce91-44b0-a55d-307d9f929acd`
**Room:** AGENTROOM (`d98896162f09`)

---

## Setup

- **Relay node:** `creepy-mini` — status `online`, lastHeartbeatAt `2026-06-25 05:00:38`
- **Peer2 instruction sent via relay:** asked to join `https://voice.silverjrom.app/room/agentroom`, enable mic, speak for duration
- **Harness invocation:**
  ```
  node e2e/scripts/capstone-record-host.mjs --peers 1 --record-ms 240000
  ```
  `--peers 1`: wait for Peer2's audio before recording starts  
  `--record-ms 240000`: 4-minute (240 s) recording window

---

## Peer2 Join Confirmation

Relay poll confirmed Peer2-codex received the CAPSTONE message at `2026-06-25 05:03:44` and immediately began joining (`verifying room, recreating client, dispatching gate-aware join flow`). The harness confirmed:

```
[CAPREC] remote audio publishers = 0   (×17 — waiting for Peer2)
[CAPREC] peers ready = 1               (Peer2 joined and published audio)
[CAPREC] record started? isRecording= true
[CAPREC] recording for 240s...
```

Peer2 was publishing audio before recording started. ✅

---

## Harness Execution

```
[CAPREC] IN-CALL (Leave button present)
[CAPREC] peers ready = 1
[CAPREC] record started? isRecording= true
[CAPREC] recording for 240s...
[CAPREC] ending call WHILE recording (Leave call -> Close room) — exercises flushRecordingForExit
[CAPREC] clicked Close room — waiting for "Saving recording" + upload to finish
[CAPREC] upload settled
[CAPREC] done; closing
```

Path exercised: **Leave call → Close room while recording active** — the exact `flushRecordingForExit` path that was broken in the HRIS_TOJ incident.

---

## Backend Log Evidence — `[rec] saved`

Three new entries at `2026-06-25T05:06:52`, session `a88ef4ef`:

```
2026-06-25T05:06:52: [rec] saved 2026-06-25T05-06-52-020Z_a88ef4ef-ce91-44b0-a55d-307d9f929acd_d98896162f09_AGENTROOM_e387dc.webm (3812.1 KB)
2026-06-25T05:06:52: [rec] saved 2026-06-25T05-06-52-018Z_a88ef4ef-ce91-44b0-a55d-307d9f929acd_d98896162f09_AGENTROOM_recorder_baa528.webm (3812.4 KB) [per-user]
2026-06-25T05:06:52: [rec] saved 2026-06-25T05-06-52-047Z_a88ef4ef-ce91-44b0-a55d-307d9f929acd_d98896162f09_AGENTROOM_peer2us_fb83c3.webm (3786.5 KB) [per-user]
```

No `[rec] rejected` lines for this session. ✅

---

## Files on Disk

```
-rw-rw-r-- 1 agjrom agjrom 3.7M Jun 25 05:06  ...AGENTROOM_peer2us_fb83c3.webm   (Peer2 per-user)
-rw-rw-r-- 1 agjrom agjrom 3.8M Jun 25 05:06  ...AGENTROOM_recorder_baa528.webm  (host per-user)
-rw-rw-r-- 1 agjrom agjrom 3.8M Jun 25 05:06  ...AGENTROOM_e387dc.webm           (session mix)
```

All three files are ~3.8 MB — **7.5× larger** than the 30 s smoke test (~507 KB), consistent with 4 minutes of real audio from two publishers.

---

## Library Proof — `/api/recordings`

Authenticated request to `http://localhost:4700/api/recordings` confirms all three recordings are visible in the owner's library:

| Filename | sizeBytes | sessionId | room |
|----------|-----------|-----------|------|
| `…AGENTROOM_peer2us_fb83c3.webm` | 3,877,361 | `a88ef4ef-…` | AGENTROOM |
| `…AGENTROOM_recorder_baa528.webm` | 3,903,868 | `a88ef4ef-…` | AGENTROOM |
| `…AGENTROOM_e387dc.webm` | 3,903,554 | `a88ef4ef-…` | AGENTROOM |

Total recordings in library: 322 (these 3 are the newest). ✅

---

## Regression Closure

| Evidence | Value |
|----------|-------|
| Pre-fix baseline (HRIS_TOJ) | Zero `[rec] saved` on close-room — recording lost |
| Previous recordings (pre-fix, Jun 23) | Last save was `2026-06-23T23:18:01` |
| B1 smoke (30 s, solo, Jun 25 03:59) | `[rec] saved` ~507 KB (confirmed fix, no peer) |
| **B5 capstone (240 s, real Peer2, Jun 25 05:06)** | `[rec] saved` ~3.8 MB each — **definitive real-call proof** |

The HRIS_TOJ close-room-loses-recording regression is confirmed closed on a genuine 4-minute two-party call.

---

## Cleanup

- AGENTROOM was **not deleted** (fixed room, preserved as required)
- TEST_ROOM01 (`testroom01001`) was **not touched**
- Peer2-codex notified via relay to stop: `"CAPSTONE DONE — you can stop the Peer2US client and stand down."`

---

STATUS: VALIDATED
