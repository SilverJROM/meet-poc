# sonnet CODE red-team CR3

Files read: `remote-audio.service.ts` (full), `room.page.ts` (effects + watchdog + recoverRemoteAudio sections), `sfu-client.service.ts` (doSubscribeTracks + rollback), `diagnostics.page.ts` (buildRemoteAudioPlayoutRows), `IMPL-prod-diff.patch`, `consensus-r4-registry.md`.

---

## CR-fix-2 verify: latch-nonsticky / rollback-touched-only / energy-join

### 1. voiceStalled latch — OK

**Set to `true`**: only via `recoverVoicePlayout()` → `setVoiceStalled(peerId, true)` (`remote-audio.service.ts:287`).

**All clear paths verified** (each traced to file:line):

| Condition | Clear call | Location |
|-----------|-----------|----------|
| emitted count climbs (consecutive poll) | `noteVoiceEmissionAdvanced` → `setVoiceStalled(false)` | `room.page.ts:2754` |
| bytes flat over full window | `clearVoiceStalls([peerId])` | `room.page.ts:2760` |
| no SFU sample (NaN/null bytes or emitted) | `clearVoiceStalls([peerId])` | `room.page.ts:2741` |
| peer absent from inbound stats | `clearVoiceStalls([peerId])` | `room.page.ts:2723` |
| `action === 'none'` + full window + no energy | `clearVoiceStalls([peerId])` | `room.page.ts:2773` |
| mutedAll true | `clearVoiceStalls()` (all) | `room.page.ts:2709` |
| peer leaves / registry clears | `removePublisher` removes entry | `remote-audio.service.ts:470-476` |
| inCall false / reset | `clearRegistry` / `reset` | `remote-audio.service.ts:387-401` |

**One tolerated transient**: after a successful replay (`el.play()` resolves), `voiceStalled` stays `true` until the next watchdog poll confirms emitted is climbing (`noteVoiceEmissionAdvanced`). Maximum duration = one watchdog interval (a few seconds). This is intentional — the watchdog is the arbiter, not the play return value.

**The "cap-exhausted + bytes-growing + energy-present + emitted-flat" case**: `action === 'none'` because `attemptsThisWindow >= 4`, `sampleWindowHasVoiceEnergy` returns true → neither `clearVoiceStalls` nor `recoverVoicePlayout` is called. `voiceStalled` stays true. This is **genuinely broken audio** (bytes arriving + some decoder energy, but jitter buffer not outputting) — the banner correctly stays up for user action. Not a false-positive stuck latch.

Latch is **non-sticky for all audio-working scenarios**. PASS.

### 2. Touched-only subscribe rollback — OK

`rollbackSubscribeMutation` (`sfu-client.service.ts:1766`):

- **Step 1 + 2**: restore `midToEntry` and `subscribedTracks` for only `touchedMidEntries` keys — entries from other publishers' concurrent subscribes are untouched. ✓
- **Step 3** (`sfu-client.service.ts:1782-1786`): re-adds `subscribedBefore` entries for `publisher.clientId` whose `trackName` is in `tracksToSubscribe`. For any mid already handled in step 2, this is idempotent (same object). For mids not touched by the failing subscribe, they were never modified — step 3 re-confirms the pre-existing state. ✓
- **Stream restore**: `restorePublisherStream` for `remoteStreams` + `remoteScreenStreams` + `restorePublisherTrackNames` — snapshots taken BEFORE the POST, so they contain only pre-subscribe state. Concurrent publishers' streams are in separate map keys, untouched. ✓
- **Error before `flushPendingOntrack`**: in the renegotiation path, `flushPendingOntrack()` is called AFTER `PUT /api/sfu/renegotiate`. Any throw before that (SRD, createAnswer, SLD, PUT timeout, `bindSubscribedMid` mid-conflict) triggers rollback with pending ontrack events still queued — registry/stream state is clean, orphaned events will be flushed on next subscribe. ✓
- **Mid-conflict throw path**: `bindSubscribedMid` throws BEFORE `this.midToEntry.set` and BEFORE `rememberTouchedMid`, so `midToEntry` was not modified for the conflicting mid — no spurious rollback entry. ✓

Rollback correctly handles concurrent publisher protection and full undo of own tracks. PASS.

### 3. trackName join in diagnostics — OK

`buildRemoteAudioPlayoutRows` (`diagnostics.page.ts:114-141`):

```
Primary lookup: kind=audio + publisherClientId + trackName (when !!publisher.trackName)
Fallback:        kind=audio + publisherClientId only
```

`publisher.trackName` in `playoutDiagnostics()` is `entry.trackName` from the registry. `entry.trackName` is set in `syncPeers` via `remoteTrackNames.get(peer.id)?.get(peer.track.id)` — the MediaStreamTrack.id is used as key to look up the SFU-assigned `trackName` stored by `registerRemoteTrackName` on `ontrack`. The inbound stats `track.trackName` is the same SFU-assigned name. The two-pass join (trackName-exact then clientId-only fallback) correctly maps per-publisher energy to the right talker in diagnostics. PASS.

---

## NEW bugs — none

| Severity | file:line | what | verdict |
|----------|-----------|------|---------|
| cosmetic | `remote-audio.service.ts:233-234` | `setVolume` dead branch: both `if` and `else` call `persistVolume(clamped)` — dead code, always persists | No functional impact; volume always correctly persisted |
| cosmetic | `remote-audio.service.ts:499-515` | `replayRegistryElements`: no `isEntryCurrent` guard between `applySinkId` and `el.play()` | Stale element would fail `el.play()` (srcObject=null after `destroyRegistryElement`); caught by catch branch which does check `isEntryCurrent`; benign |

Neither rises above cosmetic. No P0, P1, or P2 bugs found.

---

## Core path re-check (FIX1–FIX5 regression guard)

- **sink-before-play**: `addPublisher` applies `applyVolumeState` + `applySinkId` before `el.play()` (`remote-audio.service.ts:413-453`). ✓
- **syncPeers diff/dedup**: removes departed peers, skips unchanged (stream+track identity), replaces on track change — no doubled audio (`remote-audio.service.ts:250-262`). ✓  
- **banner**: `remoteAudioBlocked` signal driven by `refreshBlockedState()` — room page reads `this.remoteAudio.remoteAudioBlocked()` directly in both the effect and `recoverRemoteAudio` (`room.page.ts:638, 2662`). ✓
- **recovery**: `recoverRemoteAudio` → `recoverPlayback` → `replayRegistryElements` iterates all registered elements, applies sink + play (`remote-audio.service.ts:279-283`). ✓
- **reset**: increments generation, clears registry (pause + null srcObject + remove each el), resets `unlocked`, `inCall`, `mutedAll`, signals (`remote-audio.service.ts:387-401`). ✓
- **mid-guard (isEntryCurrent)**: checks `this.inCall && entry.generation === this.generation && registry.get(id) === entry` — generation check catches `setInCallActive` transitions; registry identity check catches concurrent `addPublisher` replacements (`remote-audio.service.ts:520-522`). ✓

No regressions found in any of FIX1–FIX5 mechanisms.

---

STATUS: CLEAN — no real bug in current code
