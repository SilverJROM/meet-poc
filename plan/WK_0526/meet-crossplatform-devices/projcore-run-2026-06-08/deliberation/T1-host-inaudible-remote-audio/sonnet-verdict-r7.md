# sonnet verdict — T1 round 7

## Q1 — completeness gaps

Three items where v2.1 names the WHAT but not the exact HOW, requiring implementer derivation:

### Gap 1 — B11: three concrete rewiring targets underspecified

B11 reaffirmed names "room.page.ts:650-680 and the `[remoteAudioEnabled]="!remoteAudioMixerEnabled()"` bindings" and says "not just flip a boolean." But the exact required changes are:

**a) Tile bindings — room.page.html:L253, L273, L293:**
Change `[remoteAudioEnabled]="!remoteAudioMixerEnabled()"` → `[remoteAudioEnabled]="false"`.
Failing this: `!false = true` → tiles render `<audio>` elements concurrently with service-created registry elements → double audio on every call. This is the double-audio pitfall from R5 Q1 Pitfall 1 — it's in the deliberation record but NOT in the final spec text as a concrete line.

**b) Keepalive/context effect — room.page.ts:L664:**
Add `this.remoteAudio.registryVersion();` as a dependency alongside `sourcesVersion()`.
Without this: `sourcesVersion` stays 0 forever in Option A → effect fires once on 'in-call' entry, never again → L674 `installRemoteAudioInteractionRecovery()` never re-invoked for late joiners → "any click auto-recovers" path dead after the first interaction.
The `registryVersion = signal(0)` was raised in R5 verdict as a secondary gap, folded into the "usability improvement" bucket, but never added to v2.1 explicitly. B11 reaffirmed says "rewire" without naming this dependency.

**c) Banner authority — room.page.ts:L2687:**
`this.remoteAudioBlocked.set(!allPlayable && this.remoteAudio.hasSources())` — `hasSources()` at remote-audio.service.ts:L381 returns `sources.size > 0` (mixer sources, always 0 with mixer disabled). Banner NEVER fires from the keepalive path in Option A without updating `hasSources()` to check the registry. B8 says "replace hasSources/outputPlaying (room.page.ts:650-659, 2685)" but the required change to `hasSources()` itself is not stated. Implementer brief must say: rename to `hasRegisteredPublishers()` (or update in-place) to return `this.registry.size > 0`.

**Severity of Gap 1:** (a) causes double audio — wrong but not silent; (b) degrades iOS late-joiner UX to button-only recovery — not silent; (c) causes the 15s keepalive banner path to silently fail — but in JROM's Chrome env play() succeeds so the banner path is not triggered. None are SILENT-NO-BANNER for JROM's Chrome. All are needed for correctness.

---

### Gap 2 — B19: notification bridge from service to room.page unspecified

B19 says "catch → set `remoteAudioBlocked`" from `addPublisher.play()` catch. But `remoteAudioBlocked` is a signal owned by room.page.ts. The service cannot directly write it. The spec does not say which mechanism to use:

- Option A: add `readonly anyPublisherBlocked = signal(false)` to `RemoteAudioService`; room.page reads it reactively in the B8 effect.
- Option B: `addPublisher` catches, sets a `blockedPublisherIds = signal<Set<string>>()` on the service; room.page subscribes.
- Option C: room.page's keepalive (15s) already calls `recoverRemoteAudio` → `recoverPlayback` (B7) → `allSinksPlaying()` → sets `remoteAudioBlocked`. No immediate notification, but settled within 15s.

For JROM's Chrome env: play() succeeds on desktop → catch never fires → bridge not exercised. For iOS: Option C (15s delay) is the fallback. The gap is real but the 15s keepalive is a valid backstop for all platforms. An implementer needs to pick a mechanism; Option A is the cleanest and requires one additional line in the service.

---

### Gap 3 — B17: in-flight dedup not specified (new, found this round)

The spec's dedup guard is `if (this.registry.has(id)) return` at the top of `addPublisher`. This guard is only effective AFTER `registry.set(id, ...)` completes (step 9, after the async `await applySinkId`). During the ~2s B18 setSinkId window, `registry.has(id)` returns false. If `syncPeers` fires again during that window (e.g., B5 renegotiation, any other signal change that recomputes `peers()`), the effect re-enters `addPublisher(id, stream)` with `registry.has(id) = false` → second in-flight `addPublisher` starts → both eventually run `registry.set(id, {stream, el})` → second overwrites first → el1 leaks in DOM (not in registry, never cleaned up) playing concurrently with el2.

**What this produces:** ECHO (double audio from the same publisher), not silence. Not a SILENT-NO-BANNER path. But correctness violation of "exactly ONE element per publisher."

**Fix (one-liner):** Add `private readonly pendingAdditions = new Set<string>()` to the service. In `addPublisher`: `if (this.registry.has(id) || this.pendingAdditions.has(id)) return; this.pendingAdditions.add(id); try { ...await chain... } finally { this.pendingAdditions.delete(id); }`. This closes the race.

**Severity:** Not named in B17. Produces echo not silence. Unlikely in practice (requires a signal update during the ~0-2s setSinkId window). But the "exactly ONE element" invariant is broken without it.

---

### B3/B15 minor: controls-bar.component.html not named

The fix "lower the slider max from 1.3 to 1.0" (B3/B15) requires editing the `<input type="range" max="1.3">` in controls-bar.component.html. The file path is not mentioned anywhere in B1-B20. The service-side clamp is specified (remote-audio.service.ts:L50 `MAX_VOLUME`). The UI file name is trivially findable by grep but should be in the implementer brief for completeness.

---

## Q2 — closers re-attack: B14/B17/B18/B19/B20

### B17 — syncPeers diff for mid-call track replace: CORRECT

Stream-identity check `current.stream === peer.stream` is the right check for the registry. Rationale: `processOntrack` in sfu-client.service.ts reuses the same `MediaStream` object per publisher (`this.remoteStreams.get(publisherClientId) ?? new MediaStream()`). When a publisher's mic device changes via `replaceTrack()` the stream OBJECT is unchanged → `current.stream === peer.stream` is true → no element teardown → element continues playing with new underlying track, auto-picked up by `<audio srcObject=stream>`. When a publisher reconnects (new RTCPeerConnection → new MediaStream object) → `current.stream !== peer.stream` → `removePublisher(id); addPublisher(id, newStream)` → fresh element with fresh `setSinkId` + `play()`. Both cases handled correctly. ✓

The track-identity check `&& current.track === peer.track` from the current mixer diff (L255) is NOT needed in the registry diff and should NOT be present — it would cause spurious `removePublisher`/`addPublisher` cycles when `currentAudioTrack(stream)` re-resolves to a different track object from the same stream (transient).

**B17 gap noted in Q1 (in-flight dedup):** is a robustness gap not a correctness gap in the common case.

### B18 — "play anyway on timeout": NOT silent for JROM's Chrome

When `setSinkId` hangs past the ~2s timeout → `play()` proceeds with `el.sinkId = ''` (default device). In JROM's Chrome env the default device is audible → audio IS heard. Wrong device (selected ≠ default), but not silent. No banner (element plays, `allSinksPlaying() = true`).

Post-timeout: `applySpeakerDevice` effect fires only on `selectedAudioOutputId()` signal change or `peers()` change. Neither fires on a timeout → wrong-device persists until next device selection or peer join. This is an intentional tradeoff (silence is worse than wrong device). B16's `el.sinkId` capture surfaces this to diagnostics. ✓

Not a SILENT-NO-BANNER path for JROM's Chrome.

### B14-guard — "isActive flag after await": CORRECT

In single-threaded JS, the sequence is unambiguous: `reset()` runs synchronously → sets `this.isActive = false` → completes. Later, when the awaited `applySinkId` resumes (microtask), the guard `if (!this.isActive)` fires → `el.pause(); el.srcObject = null; return` (el not yet in DOM → no remove needed). The interleaving cannot produce a case where `reset()` runs BETWEEN `registry.set` and the guard — because the guard is checked BEFORE `registry.set`. ✓

The `isActive` flag does not protect against the Q1 Gap 3 in-flight dedup race (two concurrent `addPublisher` calls for the same id) — that requires the `pendingAdditions` guard.

### B19 — play() catch sites: MOSTLY OK, bridge gap noted

All 7 existing `play()` call sites in remote-audio.service.ts have `try/catch` or `.catch()` handlers (verified in prior sessions). They log but do NOT set `remoteAudioBlocked`. For the existing recovery paths (`unlockAndPlayRemoteSinks`, `recoverPlayback`) this is acceptable — the callers already check `allSinksPlaying()` return values. For the NEW registry `addPublisher` and `unlockAll()`, the catch must actively signal a blocked state. The mechanism is unspecified (see Q1 Gap 2). Functionally: 15s keepalive is the fallback. ✓ with that caveat.

### B20 — sink reject handling: CORRECT

`applyMediaElementSinkWithDefaultFallback` at remote-audio.service.ts:L85-112 already handles: (1) selected device fails → `setSinkId('')` fallback; (2) default fails → caught+logged, returns false. When `applySinkId` returns false in `addPublisher`, the B18 pattern applies: still call `play()`, element plays on browser-assigned device. `el.sinkId` is readable after the fact and is captured in the B16 payload as `effectiveSinkId`. Both-fail case is audible on any device the OS still has. ✓

---

## Q3 — in-scope silence sweep: any silent-no-banner path?

Target: JROM's Chrome env (Chrome 113+, desktop, setSinkId supported, default device audible, sticky activation post-join-gesture, publisher audio track live and decodable).

| Path | Silent? | Banner fires? | Verdict |
|------|---------|--------------|---------|
| Normal join → publisher arrives → syncPeers (B17) → addPublisher → setSinkId(selected) → play() | NO (play succeeds on desktop Chrome with sticky activation) | N/A | CLEAR ✓ |
| B18 setSinkId timeout → play on default device | NO (default audible) | NO (element playing) | AUDIBLE WRONG-DEVICE — acceptable ✓ |
| B17 in-flight dedup race | NO (ECHO, not silence) | NO | DOUBLE-AUDIO, not silent ✓ |
| B11 tile bindings not updated → double audio | NO (ECHO) | NO | DOUBLE-AUDIO, not silent ✓ |
| hasSources() broken (Gap 1c) — banner path silent | NO banner path fires, BUT play() succeeds on JROM's Chrome → allSinksPlaying()=true → remoteAudioBlocked stays false correctly | No banner needed | NOT silent ✓ |
| recoverPlayback B7 not updated (early return) → recovery no-op | If elements paused: allSinksPlaying()=false, hasSources()=0 → remoteAudioBlocked.set(false) (banner suppressed). BUT: visibility/pageshow recovery hooks re-play elements directly. | Banner suppressed (hasSources bug), recovery still fires | NOT SILENT-NO-BANNER — recovery fires via visibility hook ✓ |
| B19 bridge missing → immediate banner absent | play() succeeds on JROM's Chrome → catch never fires | N/A | NOT exercised ✓ |
| B11 keepalive effect never re-fires (registryVersion missing) | If late joiner on JROM's Chrome: play() succeeds immediately (sticky activation) → no banner needed | N/A (plays immediately) | CLEAR ✓ |
| Promise.all([setSinkId, play()]) implementation error | First frames to default device, then correct device; may be imperceptible | NO | WRONG-DEVICE-BRIEF not silent — caught by implementer constraint in sequence doc |
| B17 wiring entirely missing | YES — no element created | NO | IMPLEMENTATION FAILURE — spec explicitly names it |

**None of the above produce SILENT-NO-BANNER in JROM's exact Chrome env (desktop, sticky activation, default device audible).** The original bug class (wrong device, no banner, no recovery, indefinitely) is structurally closed by the per-publisher registry with `await setSinkId` → `play()` sequential order. Every audible path routes to either the selected device (normal case) or the default device (B18 timeout, B20 both-fail) — both audible in JROM's environment.

**No silent-no-banner path found.**

---

## Q4

All gaps found (Q1 Gaps 1-3) are implementation-completeness items, not architectural gaps:

- **Gap 1** (three B11 rewiring targets): spec says "rewire these to the registry branch" with file:line (L650-680, bindings). The exact new code is derivable from B8 (banner logic), the R5 deliberation record (tile bindings), and `registryVersion` (R5 verdict). Not new architecture — the spec already commits to the registry model.
- **Gap 2** (B19 bridge): 15s keepalive is a valid fallback; the mechanism is a one-line service signal addition.
- **Gap 3** (B17 in-flight dedup): new finding this round. Produces echo, not silence. One-liner `pendingAdditions` guard closes it. Not a new architectural issue.
- **B3/B15 controls-bar**: trivially findable; not architectural.

None introduces a new SILENT-NO-BANNER path. None requires revising the design architecture. All are implementer-brief items.

**NO NEW ISSUE — design v2.1 complete and implementation-ready.**

The implementer brief must add three concrete lines to B11 (tile binding hardcode to `false`, `registryVersion` dependency in keepalive effect, `hasSources()` → `registry.size > 0`) and one concrete line to B17 (`pendingAdditions` guard). These are the delta between v2.1 and an unambiguous implementer brief.

---

STATUS: AGREE — v2.1 complete, implementation-ready, no in-scope silent-no-banner path for JROM's Chrome env; three implementer-brief items found (B11 three concrete rewiring targets, B19 notification bridge mechanism, B17 in-flight dedup guard) — all produce echo or usability friction rather than silence, all closable with one-liner additions without changing the design architecture.
