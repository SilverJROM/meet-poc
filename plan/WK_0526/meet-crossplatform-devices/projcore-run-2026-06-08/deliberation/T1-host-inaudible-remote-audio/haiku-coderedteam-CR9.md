# haiku CODE red-team CR9 (lens L9: privacy/perf/closure)

## Privacy/security of payload: LEAK (room.page.ts:519, remote-audio.service.ts:1310,1324)

**Found**: Raw device sinkIds in diagnostics payload. Code:
- Line 519 (room.page.ts): `selectedAudioOutputId: this.selectedAudioOutputId()` — persisted raw to payload
- Line 1310 (remote-audio.service.ts): `selectedAudioOutputId: this.selectedSinkId ?? null` — raw in playoutDiagnostics
- Line 1324: Per-publisher `sinkId: withSink.sinkId ?? null` — raw device UUID

The display layer DOES hash these with `shortHash(sinkId)` (diagnostics.page.ts:109-114), but the payload itself carries raw hardware identifiers. Non-owner participants who sniff the POST body see:
- Which speaker device the host selected (UUID-level granularity)
- Per-publisher sink routing state

**Fix required**: Either redact sinkIds in the payload with shortHash before POST, or gate the full `remoteAudioPlayout` field owner-only at the server endpoint (backend not shown in diff).

## Perf-at-scale: OK (registry O(n), no repeated DOM scans per peer)

**Checked**:
- `syncPeers` (line 1033-1066): O(n) registry iteration, no O(n²) per-sync
- `applyOutputDevice` (line 1100-1155): Promise.all over entries, O(n) with concurrent timeout guard (SINK_ID_TIMEOUT_MS = 2_000)
- Voice watchdog (room.page.ts): clearVoiceStalls iterates peers, per-callback safe
- `replayRegistryElements` (line 1624-1661): Promise.all, O(n) per replay

Old `document.querySelectorAll('audio[data-remote-audio]')` replaced by `registry.entries()`. Single DOM query for video/audio:not([data-remote-audio]) at applySpeakerDevice (line 420) doesn't scale with publisher count.

**Verdict**: No hotspots under 5-10 publishers. Architecture shifted from centralized mixer (single SPOF) to per-element (parallel I/O), which scales better.

## FINAL closure: does the EXACT JROM scenario now resolve to "host hears both on selected device, honest diagnostics"? residual original-symptom path?

**Scenario recap**: Host received clean RTP, heard NOTHING, had non-default speaker selected, NO banner appeared, Google Meet worked on same device.

**OLD CODE** (pre-CR9):
- Single shared Web-Audio mixer output element with `srcObject = AudioContext.destination.stream`
- All remote sources mixed via MediaStreamAudioSourceNode → gain → limiter → destination
- One `setSinkId` applied to mixer output element
- If mixer's setSinkId fails (stale device ID, unsupported routing, driver issue), ALL audio silent
- Autoplay suspend + banner only triggered if context suspended WITH sources; if context running + output routing failed, no banner

**NEW CODE** (post-CR9):
1. **Per-publisher `<audio>` elements** (line 1388-1432 in addPublisher):
   - Each remote stream gets own element, appended to document.body
   - srcObject = MediaStream directly (NOT Web-Audio destination)
   - No central mixer; no single SPOF
   
2. **Per-element sink routing** (line 1436, 1633):
   - setSinkId applied to EACH element independently with 2-second timeout
   - If one fails → `sinkApplyResult = 'failed'`, element marked blocked
   - Other elements continue (not all-silent)
   
3. **Blocking detection** (line 1729-1735, 1711-1719):
   ```typescript
   function remoteAudioBlockingReason(entry):
     if (sinkApplyTimedOut || sinkApplyResult === 'failed') return 'sink-failed'
     if (voiceStalled) return 'voice-stalled'
     if (playbackFailure) return null
     if (el.paused) return entry.blocked ? 'autoplay' : 'paused'
     return null
   
   refreshBlockedState():
     blocked = entries.some(entry => remoteAudioBlockingReason(entry) !== null)
     remoteAudioBlocked.set(blocked)
   ```
   → If any element's sink fails, banner shows. But elements still attempt play() and may succeed on fallback/default.
   
4. **Voice recovery now energy-aware** (line 831, 852-868):
   - Only triggers if `sampleWindowHasVoiceEnergy()` = true
   - Checks audioLevel ≥ 0.0005 OR audioEnergy delta > 0.000001
   - Old bytes-only approach could trigger false recovery on received-but-low-quality audio

### Does host NOW HEAR both on selected device?

**Architecture fix: YES**. Removed single SPOF (centralized mixer → per-element routing).

**Sink routing**: Still uses same `applyMediaElementSinkWithDefaultFallback` / `LatestSinkIdApplier.apply` chain, but now:
- If selected device ID is stale/unsupported → `sinkApplyResult = 'default-fallback'` or `'failed'`
- Element still plays (autoplay may succeed) → audio heard on default/fallback
- Banner shows (`selectedSpeakerUnavailable` signal + error dialog at room.page.ts:326-328)

**If selected device WAS valid** (as in JROM scenario with Google Meet proving same hardware works):
- setSinkId should succeed → `sinkApplyResult = 'selected'`
- Element plays on selected device
- No banner
- ✅ Expected outcome

**HOWEVER**: If selected device is discovered to be **unavailable during devicechange event** (room.page.ts:680-690):
- `shouldReconcileAudioOutputAfterRefresh` checks device availability
- Stale ID is cleared, fallback to preferred device
- `selectedSpeakerUnavailable.set(true)` + error dialog
- ✅ User gets feedback

### Residual path to original symptom (received-but-silent)?

**Theoretically CLOSED** IF:
1. Browser's audioOutput routing (setSinkId on `<audio>` elements with MediaStream srcObject) is reliable ✓ (standard Web Audio API)
2. SFU-received RTP is correctly attached to streams ✓ (no regression in stream binding)
3. Element.play() succeeds after sink routing ✓ (guarded with timeout)
4. Volume state is applied correctly ✓ (line 1619: `el.volume = mutedAll() ? 0 : Math.min(volume(), MAX_VOLUME)`)

**Edge case NOT fully sealed**: If the per-element audioOutput routing itself has a **cross-browser quirk** (e.g., some browsers ignore setSinkId on an element whose srcObject is a MediaStream vs. a Web-Audio stream), the new code doesn't defend against that. The old mixer-based code would have ALSO failed in that case, so it's not a regression. But the fix is architectural (per-element), not algorithmic.

**One minor asymmetry**: Line 1732 `if (entry.playbackFailure) return null;` suppresses blocking banner if play() failed with KNOWN errors (NotSupportedError, AbortError). If JROM's browser rejected autoplay with a new error type (not caught by classifyPlaybackFailure), `entry.blocked` would be set but element remains paused → no banner. However, this is unlikely and pre-CR9 code had no recovery for unknown autoplay errors either.

## NEW bugs (table) or "none"

| Finding | File:Line | Severity | Impact |
|---------|-----------|----------|--------|
| Device sinkIds leak in diagnostics payload (raw UUIDs, not redacted) | room.page.ts:519, remote-audio.service.ts:1310,1324 | HIGH | Non-owner participants can infer selected/fallback speaker hardware; cross-tenant data exposure risk if not gated owner-only at backend |
| (Non-bug) Voice recovery MIN_AUDIO_LEVEL may filter legitimate weak audio | remote-audio.service.ts:822 | LOW | Weak but valid remote audio (distant speaker) might not trigger recovery even if stalled; acceptable tradeoff for noise immunity |

---

STATUS: **BUGS** — privacy leak in payload. Architecture closure is solid (per-element fixes all-silent), but device IDs must be redacted or owner-gated before this ships to production.
