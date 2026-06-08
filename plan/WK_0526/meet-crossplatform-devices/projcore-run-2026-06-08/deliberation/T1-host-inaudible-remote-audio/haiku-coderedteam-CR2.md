# Haiku CODE red-team CR2 — voiceStalled latch vulnerability + minor hygiene

## CR-fix-1 Verification Summary

### ✅ CR-fix-1 Intent Confirmed
CR-fix-1 replaces the mixer-era AudioContext graph with per-publisher HTML audio elements, managed by a `registry` Map. The voiceStalled latch is per-publisher state in `RemotePublisherEntry.voiceStalled`, set true by `recoverVoicePlayout()` and cleared only by `noteVoiceEmissionAdvanced()`.

### ⛔ **P0 BUG — voiceStalled LATCH FALSE-POSITIVE on legitimately SILENT remote**

**Evidence:**
- **Trigger path** (remote-audio.service.ts:254-258): `recoverVoicePlayout()` sets `voiceStalled=true` when voice watchdog detects bytes climbing but emission flat
- **Clear path** (remote-audio.service.ts:261-262): `noteVoiceEmissionAdvanced()` sets `voiceStalled=false` ONLY when `remoteVoiceEmittedClimbed()` returns true
- **remoteVoiceEmittedClimbed()** (room.page.ts:3886-3889): Returns true iff `last.emitted > second_to_last.emitted` — requires jitterBufferEmittedCount to advance
- **Silent peer flow** (room.page.ts:2733-2772):
  1. Silent remote (no audio emission) subscribed; RTP keepalive makes `bytesReceived` climb
  2. Watchdog fills 4 samples: `{ bytes: 1, emitted: 0 }, { bytes: 2, emitted: 0 }, { bytes: 3, emitted: 0 }, { bytes: 4, emitted: 0 }`
  3. `remoteVoiceBytesClimbed()` = true (4 > 1), `remoteVoiceEmittedClimbed()` = **false** (0 never > 0)
  4. `decideVoiceRecovery()` (remote-audio.service.ts:65-83) triggers recovery (line 2758-2771)
  5. `recoverVoicePlayout()` → `setVoiceStalled(peerId, true)` (line 256)
  6. **Banner shows (remoteAudioBlocked signal set true via refreshBlockedState())**
  7. Next sample: bytes climb, emitted still flat
  8. **watchdog triggers recovery again** (up to 4 attempts per window)
  9. Attempt cap hit (line 67) → action='none', watchdog pauses
  10. **BUT: voiceStalled was set to true and NEVER clears because emitted never climbs for a silent peer**
  11. **Banner stays up forever until peer leaves or talks**

**Real-world trigger:**
- Peer joins without microphone (permanently silent)
- Peer joins with audio permanently muted
- Peer's audio track is dead/ended but subscription persists
- **Result:** False "host inaudible" banner on a participant who is legitimately not speaking

**file:line evidence:**
- `setVoiceStalled()` latch setter: remote-audio.service.ts:1155-1159
- `noteVoiceEmissionAdvanced()` only clear path: remote-audio.service.ts:261-262
- Watchdog trigger: room.page.ts:2758-2771
- `remoteVoiceEmittedClimbed()` requires emission climb: room.page.ts:3886-3889
- `refreshBlockedState()` sets banner based on voiceStalled: remote-audio.service.ts:505-512 (line 507: `blocked = entries.some(... entry.voiceStalled ...)`

**Fix direction (not in scope):**
- voiceStalled should be cleared when peer leaves (already correct via syncPeers → removePublisher)
- voiceStalled should be cleared on ANY emission advancement OR when peer is known-muted (needs per-peer mute tracking)
- OR: suppress recovery attempts for known-silent peers (requires distinguishing "legitimately silent" from "broken emission")

---

### ✅ Subscribe Rollback Streams Restore — CORRECT

- **sfu-client.service.ts:1250-1251**: Snapshots `remoteStreams` and `remoteScreenStreams` fresh at each `doSubscribeTracks()` call ✓
- **sfu-client.service.ts:1295-1296**: Restores snapshots on rollback ✓
- Generation/timestamp tracking prevents stale rollback ✓
- Concurrent publisher streams safe from accidental removal ✓

---

### ✅ Per-Publisher Energy Tracking — INCOMPLETE but SAFE

- **meeting-sessions.service.ts:354-364**: `RemoteAudioPlayoutDiagnostics.perPublisher` entries do NOT include `totalAudioEnergy` field
- **diagnostics.page.ts:136-137**: Diagnostics UI renders `totalAudioEnergy` by FALLING BACK to matching inbound track lookup (lines 120-125)
- **sfu-client.service.ts:1226-1233**: `mediaPlayout` (call-wide aggregate) correctly computed with `mergeMediaPlayout()` ✓
- **sfu-client.service.ts:747-1212**: `SfuInboundTrackStats` now carries `totalAudioEnergy` per-track ✓

**Assessment:** Per-publisher inbound energy is fetched indirectly (via inbound track match), not directly stored. This is a WORKAROUND (diagnostics completeness), not a functional bug. Would be cleaner to add `totalAudioEnergy: number | null` to `perPublisher` schema, but current code is safe.

---

### ✅ reset() Hygiene — MINOR DEAD CODE

- **remote-audio.service.ts:347-362**: `reset()` calls both `clearRegistry()` (line 350) and `clearSources()` (line 351)
- **clearRegistry()** (line 439-442): Iterates registry, removes each publisher, clears map
- **clearSources()** (line 445-446): Iterates registry, removes each publisher
- **Bug:** Line 351's `clearSources()` iterates an ALREADY-CLEARED registry (line 350 cleared it), so it's a dead iteration with no effect
- **Safety:** Harmless; no crash or correctness issue
- **Cleanliness:** Remove line 351 or consolidate function (see line 956 for parallel dead code)

---

### ✅ syncPeers Track-Replace, Late-Joiner — CORRECT with Generation Guard

- **remote-audio.service.ts:212-231**: Sync logic removes old, adds new ✓
- **Line 230:** `void this.addPublisher(...)` is fire-and-forget async; syncPeers doesn't await
- **Race scenario:** Two rapid syncPeers calls create duplicate addPublisher tasks for same id
- **Guard:** Line 485-486, `isEntryCurrent()` checks `entry.generation === this.generation`; stale entries destroyed (line 408-411, 415-417, 421-423) ✓
- **Correctness:** Safe; generation incremented on call-state changes (line 342-343), stale elements cleaned up ✓

---

### ⛔ **SECONDARY — refreshBlockedState() double-set on voice recovery**

- **remote-audio.service.ts:256**: `setVoiceStalled(peerId, true)` calls `refreshBlockedState()`
- **remote-audio.service.ts:258**: `replayRegistryElements()` internally calls `refreshBlockedState()` (line 480, inside each entry's catch/finally)
- **No functional impact**, but causes 2+ state updates on a single recovery attempt
- **Minor:** Reactive framework batches signal updates; not a bug, but verbose

---

### ✅ New Regressions — None Found

- Banner routing (room.page.ts:629-642) now pulls from `remoteAudio.remoteAudioBlocked()` signal ✓
- Interaction recovery triggered when `blocked` true (line 258) ✓
- All per-entry state cleanup on element destroy (destroyRegistryElement, lines 489-502) ✓

---

## Summary Table

| Severity | Category | File:Line | Finding | Verdict |
|----------|----------|-----------|---------|---------|
| **P0** | Logic | remote-audio.service.ts:515–519, room.page.ts:3886–3889 | voiceStalled latch stuck true on silent remote; emitted never climbs so noteVoiceEmissionAdvanced never fires; banner never clears | **REAL BUG** |
| Low | Code Hygiene | remote-audio.service.ts:351 | clearSources() called after clearRegistry() on empty map; dead code | Safe, remove line |
| Low | Diagnostics | meeting-sessions.service.ts:354–364 | Per-publisher totalAudioEnergy not directly stored; falls back to inbound track lookup | Incomplete but safe |
| Low | Verbosity | remote-audio.service.ts:256, 480 | refreshBlockedState() called 2+ times per recovery attempt | No functional impact |

---

## STATUS: **BUGS — P0 voiceStalled false-positive on legitimately silent remote**

**Blocking live:** Yes. False banner on silent participants breaks user trust and suggests a real audio issue when none exists.

**Evidence quality:** High. Traced full watchdog → recovery → latch → clear path. Silent-peer scenario is realistic and reproducible.

**Recommended action before JROM test:** Fix voiceStalled latch to either (1) clear on ANY peer unmute/activity, (2) detect muted-peers and skip recovery, or (3) timeout latch after N recovery attempts.
