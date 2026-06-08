# sonnet CODE RED-TEAM CR2

## CR-fix-1 verification: P0-latch / rollback / per-pub-energy / reset

### P0 latch (`voiceStalled` banner-latch) — GAP FOUND

The latch mechanism works correctly in the **normal stall→recovery→talking** path:
- `decideVoiceRecovery` fires only when bytes climb AND emitted is flat for 4 samples
- `recoverVoicePlayout` sets `voiceStalled=true` → banner
- Next watchdog cycle: emitted advances → `remoteVoiceEmittedClimbed` → `noteVoiceEmissionAdvanced` → `voiceStalled=false` → banner clears

**But there are two STUCK cases (see Bug #1 and #2 below):**

The `!remoteVoiceBytesClimbed` guard at `room.page.ts:2753` — which fires when bytes go flat (peer truly silent) — resets `attemptsThisWindow` but does NOT call `noteVoiceEmissionAdvanced`. Once `voiceStalled=true` is latched, this guard never clears it. The only escape is emitted advancing (peer talks again) or peer leaving the registry.

### Rollback streams restore — OK with one caveat

`cloneMediaStreamMap` correctly snapshots/restores by creating new `MediaStream` objects carrying the same underlying tracks. The cloned objects are functionally equivalent for playback. The minor side effect: after rollback, `syncPeers` sees different stream-object identity → `addPublisher` rebuilds the audio element for those peers. Audio continuity is preserved (same tracks). Ordering is correct: snapshot is taken before any subscribe mutation, restore is inside the caught error path. No concurrent mutation risk (subscribe ops are serialized via `enqueue`). **OK.**

### Per-publisher `totalAudioEnergy` — LOW-FIDELITY BUG (diagnostic only)

The row-builder in `diagnostics.page.ts:123-125`:
```ts
track.kind === 'audio' &&
track.publisherClientId === publisher.publisherClientId &&
(!publisher.trackId || track.trackName === publisher.trackId),  // ← dead condition
```
`publisher.trackId` is `entry.track.id` — a MediaStreamTrack UUID. `track.trackName` is an SFU semantic label (e.g. `"audio"`). They can never match. The fallback `find` (publisherClientId only) always wins. For single-audio-track peers (the common case) it finds the correct stat. For multi-track publishers it silently picks the first audio track regardless. Diagnostic display only; no audio impact.

The `mediaPlayout` call-wide stat is correctly accumulated via `mergeMediaPlayout` across all `media-playout` RTCStats entries and correctly labeled as call-wide. Per-publisher energy path is per `inbound-rtp` stat (correct). **Display bug only, not playout.**

### `reset()` hygiene — OK (redundant code, not a bug)

`reset()` calls `clearRegistry()` (which empties the map via `removePublisher` on each entry, then `this.registry.clear()`) and then immediately calls `clearSources()` (which iterates the now-empty registry — a no-op). Redundant, not harmful. `unlocked` and `selectedSinkId` are correctly zeroed. `remoteAudioBlocked` is explicitly set false. No dangling refs.

---

## NEW bugs found

| Sev | File:line | What | Fix |
|-----|-----------|------|-----|
| **MEDIUM** | `room.page.ts:2753-2755` | `!remoteVoiceBytesClimbed` guard returns without calling `noteVoiceEmissionAdvanced`. If `voiceStalled=true` was set by a prior stall cycle and the peer's bytes subsequently go flat (truly silent, no keepalives), the banner never clears. Stuck for the rest of the call until peer speaks or leaves. | Add `this.remoteAudio.noteVoiceEmissionAdvanced(track.publisherClientId);` before the `return` on line 2755. |
| **MEDIUM** | `room.page.ts:2758-2771` + `remote-audio.service.ts:256` | False-positive banner on legitimately silent participant: if a peer's `jitterBufferEmittedCount` doesn't advance during DTX silence (iOS Safari / aggressive silence suppression) but `bytesReceived` climbs from RTP keepalives, `decideVoiceRecovery` fires and sets `voiceStalled=true`. The banner appears on a peer who is simply quiet, not audio-stalled. Compounded by Bug #1: after the false trigger, if bytes also go flat, banner never clears. | Same fix as #1 clears the stuck case. To prevent the false trigger: `decideVoiceRecovery` could additionally gate on `jitterBufferDelay` or a `micSilent`-equivalent signal for remote peers, but that requires more stats. Minimum fix is #1 (clears stuck state); full prevention requires additional signal. |
| **LOW** | `remote-audio.service.ts:206-207` | `setVolume` if/else is dead: `if (forcePersist \|\| clamped !== value) persistVolume(clamped); else persistVolume(clamped);` — both branches are identical. Looks like a merge artifact. | Collapse to unconditional `persistVolume(clamped)` or add actual conditional logic. |
| **VERY LOW** | `remote-audio.service.ts:351` | `clearSources()` in `reset()` is a no-op because `clearRegistry()` (line 350) already empties `this.registry` before `clearSources` iterates it. | Remove the `this.clearSources()` call from `reset()`. |

---

## False-positive banner risk (silent participant): REAL at medium risk

**Precise scenario that produces a false-positive banner:**

1. Remote peer is legitimately silent (mic on, not speaking).
2. Browser sends RTP keepalives → `bytesReceived` climbs slowly.
3. `jitterBufferEmittedCount` does NOT advance (iOS Safari / aggressive DTX where no CN frames are emitted).
4. After 4 watchdog samples: bytes-climbed=true, emitted-flat → `decideVoiceRecovery` returns `'resume'`.
5. `recoverVoicePlayout` called → `setVoiceStalled(peerId, true)` → **banner fires on a quiet-but-working peer**.

**Stuck scenario (separate from the trigger):**

After any stall trigger (real or false), if bytes then go flat:
- `!remoteVoiceBytesClimbed` at `room.page.ts:2753` fires → returns without `noteVoiceEmissionAdvanced`.
- `voiceStalled` stays true indefinitely.
- Banner never clears while peer is present.

**Probability: MODERATE on iOS Safari, LOW on Chrome/Firefox** (Chrome always advances `jitterBufferEmittedCount` during DTX via CN concealment; iOS behavior is less deterministic).

**Minimum safe fix** (`room.page.ts:2753-2755`):
```ts
if (state.samples.length >= VOICE_RECOVERY_SAMPLE_WINDOW && !remoteVoiceBytesClimbed(state.samples)) {
  this.remoteAudio.noteVoiceEmissionAdvanced(track.publisherClientId); // ADD: bytes flat = peer quiet, not stalled
  this.remoteVoiceWatchdogPeers.set(track.publisherClientId, { samples: [sample], attemptsThisWindow: 0 });
  return;
}
```

This is semantically correct: a peer with no incoming bytes cannot be audio-stalled (they have nothing to play), so the stall flag should be released.

---

STATUS: BUGS — MEDIUM (voiceStalled stuck after stall+silence sequence; potential false-positive banner on iOS Safari silent participant)
