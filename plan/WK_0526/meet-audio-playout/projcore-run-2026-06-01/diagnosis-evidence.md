# Diagnosis evidence — session b35a94c9 (2026-06-01 23:26–23:36)

DB: `data/meet-poc.sqlite` (live PM2 instance, written 23:36).
clientId map: peer2=`62c96e10`, silverjrom(host)=`0d1508b6`, Phone Peer2=`0ee70a0e`.

## 1. Peer2's OUTBOUND audio is HEALTHY (not a capture bug)
`outboundAudioEnergy` (cumulative `totalAudioEnergy`) climbs steadily — laptop 0.5→4.2, phone 0.4→2.4, with a full-level (1.0000) sample on the phone. `micSilent=true` rows are just the instantaneous-level flag during speech pauses; the accumulating energy proves real capture. Both of Peer2's devices captured + published audio.

JROM's own outbound audio also healthy: outboundTracks audio bytesSent 2.18M / 29152 packets.

## 2. Audio PLAYOUT matrix (the smoking gun)
Per viewer → publisher, across the whole call, max `jitterBufferEmittedCount` (= samples handed to playout):

| Viewer | Publisher | samples | maxEmitted | maxConceal | maxBytesRecv | PLAYED? |
|---|---|---|---|---|---|---|
| Phone Peer2 | peer2(laptop) | 15 | 3,101,760 | 120 | 56,979 | YES |
| Phone Peer2 | silverjrom | 16 | 3,008,640 | 392 | 263,600 | YES |
| peer2 | PhonePeer2 | 19 | 3,598,080 | 224,559 | 161,099 | YES |
| peer2 | silverjrom | 87 | 25,654,080 | 28,070 | 2,009,141 | YES |
| **silverjrom** | **peer2(laptop)** | 85 | **0** | 0 | **1,406,835** | **NO** |
| **silverjrom** | **PhonePeer2** | 17 | **0** | 0 | **157,724** | **NO** |

**Only the host (silverjrom) has emitted=0 for every remote audio track**, despite receiving 1.4 MB / 26,634 packets with only 1 lost and 0 concealment from Peer2. The bytes arrive; they are never rendered. Everyone else's playout works.

## 3. Host transport is healthy (rules out network/SFU)
silverjrom sfuDiagnostics: connectionState=connected, iceConnectionState=connected, rttMs=17, local srflx ↔ remote host, candidate pair succeeded/nominated. inboundTracks present (audio ×2 + screen). So subscribe + transport are fine — the failure is purely local playout.

## 4. Mechanism
Mixer-only playout path (per-tile audio silenced when mixer enabled). `MediaStreamAudioSourceNode` pulls samples only when `AudioContext.state==='running'`; a suspended context ⇒ emitted stays 0 AND no sound. `unlockAndPlayRemoteSinks`/`allSinksPlaying` check only `outputElement.paused`, never `context.state`, so a suspended context falsely reports playable → `remoteAudioBlocked` banner never shows. Host performs the unlock while alone (0 sources ⇒ `output.play()` skipped) and/or resume fires from `setTimeout(0)` without gesture activation, never retried.

## Reproduce queries
See git history / the bash transcript for the exact `sqlite3 … | python3` matrix query. Re-run after the fix on a fresh call to confirm host emitted>0.
