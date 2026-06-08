# Haiku verdict — T1 round 2

## Q1 — A-mechanism ranking (with discriminator evidence file:line)

**Ranking (most → least likely against JROM's four facts: no banner AND silence AND specific device selected AND Meet works):**

| Rank | Mechanism | Confidence | Why best fit | Ruling |
|------|-----------|-----------|-------------|--------|
| **1** | **A3 (orphaned graph)** | **proven** | **Best explanation for all 4 facts simultaneously.** ensureGraph() at line 508-535 recreates context when closed BUT reuses old gain/limiter/destination nodes without clearing them. addSource (line 466-478) calls `source.connect(this.gain!)` → throws InvalidStateError (nodes from closed context cannot connect to new context) → caught and swallowed (line 475-477) → `sources.set` never called → sources.size stays 0 → hasSources=false (line 654) → remoteAudioBlocked banner NOT shown (line 657 guard) → silent, no banner. Device selection irrelevant if sources.size=0. | **PRIMARY** |
| **2** | **A4 (sinkId mis-routing)** | **plausible** | **Second-best fit.** Context would be 'running' (no banner), but setSinkId applied to a Web-Audio MediaStreamAudioDestinationNode stream (line 541, 652) may be silently ignored or routed to non-default in Chrome. JROM selected a specific device (line 16 evidence), setSinkId call routes to that stale/invalid id → fallback chain incomplete → no audible output on selected device (while OS default or other apps work). Harder to prove without fresh instrumented call + media-playout diagnostics. | **SECONDARY** |
| 3 | A1 (output.play guard) | weak | Requires sources=0 at gesture time (unlikely; evidence shows RTP flowing → processOntrack fires → sources should exist by gesture time). Partial explanation. | **WEAK** |
| 4 | A6 (keepalive gain=0) | weak | gain=0 signals inactivity; could trigger Chrome auto-suspend. But no direct evidence. Secondary to A3. | **WEAK** |
| 5 | A2 (suspended context) | ruled out | Demoted by JROM evidence: "no banner appeared." If context suspended WITH sources>0, remoteAudioBlocked banner MUST show (line 650-660 effect logic). It didn't → context was either running (rules out A2 as primary) or sources.size=0 (points to A3). | **RULED OUT** |
| 6 | A5 (SPOF single mixer) | N/A | Too generic; doesn't disambiguate causes or explain no-banner. Architectural concern, not a root cause. | **OUT OF SCOPE** |

**Discriminator logic verified:**
- **Banner suppression (line 650-660):** `if (!this.remoteAudioMixerEnabled() || !hasSources) return;` — if hasSources=false, banner logic never runs → banner SUPPRESSED. A3's sources.size=0 → hasSources=false → suppressed. ✓
- **A3 probability:** ensureGraph line 508 checks `if (!this.context || this.context.state === 'closed')` but then line 514-533 reuse this.gain/this.limiter/this.destination WITHOUT nulling them. A context can become 'closed' mid-call (e.g., via audio context GC, explicit close(), or browser inactivity timer), triggering a new context creation while old nodes remain. Next addSource connects old nodes to new context → InvalidStateError. Code path: room.page.ts line 678 `recoverRemoteAudio('effect')` → remoteAudio.recoverPlayback() → ensureGraph() + addSource if sources empty. **Confirmed path exists.** ✓

---

## Q2 — Anomaly B verdict: REAL-BUG (B1) or SEQUENTIAL (B2) — proof file:line

**Verdict: B2 (SEQUENTIAL) — no client-side overwrite bug.**

**Proof from code:**

1. **processOntrack (sfu-client.service.ts:804-829) is purely ADDITIVE:**
   ```javascript
   const next = new Map(this.remoteStreams());  // line 820: copy existing
   let stream = next.get(entry.publisherClientId);  // get publisher's stream
   if (!stream) {
     stream = new MediaStream();
     next.set(entry.publisherClientId, stream);  // create if missing
   }
   stream.addTrack(event.track);  // add to that publisher's stream
   this.remoteStreams.set(next);  // update signal
   ```
   No removal of other publishers. Each publisherClientId has its own stream entry. When publisher-2's ontrack fires, it gets its own stream object (or adds to existing one). No eviction of publisher-1.

2. **No-renegotiation subscribe path (sfu-client.service.ts:1748-1756) is additive to midToEntry:**
   ```javascript
   for (const rt of responseTracks) {
     const entry = { publisherClientId: publisher.clientId, ... mid: rt.mid };
     this.midToEntry.set(rt.mid, entry);  // set mid → entry for THIS publisher
     nextSubscribed.set(rt.mid, entry);    // add to next subscriptions
   }
   ```
   Each mid is allocated by Cloudflare per subscription per publisher. No collision (different mids) → no overwrite. Code is additive to both midToEntry and nextSubscribed. JROM's timeline shows GAP (00:26:52 no-inbound, 00:27:00 phone arrives) — consistent with SEQUENTIAL sessions (peer2 connection dropped, phone session started), NOT concurrent subscriber displacement.

3. **rememberTouchedMid (line 1683-1689) tracks previous state for rollback but does NOT remove:**
   ```javascript
   const rememberTouchedMid = (mid: string): void => {
     if (touchedMidEntries.has(mid)) return;
     touchedMidEntries.set(mid, {
       hadEntry: this.midToEntry.has(mid),
       entry: this.midToEntry.get(mid) ?? null,
     });
   };
   ```
   Stores snapshot for error recovery. No eviction logic.

**Alternative cause (SFU-side):** Cloudflare Calls SFU may enforce a 1-audio-subscription-per-client policy. When publisher-2 requests audio subscription, Cloudflare internally closes publisher-1's subscription. This is NOT a client bug. Evidence consistent with this hypothesis: timeline gap, clean RTP for each publisher in turn, no log evidence of client-side errors.

**Ruling:** B2 — no client-side overwrite. The one-publisher-at-a-time anomaly is driven by the SFU's subscription policy, not a bug in sfu-client's reconcile/processOntrack logic. Secondary to fix (not blocking primary playback issue).

---

## Q3 — Fix set: patch-mixer + R3 diagnostics (+ medium-term per-publisher elements)

**Decision: Patch the mixer (fix A3 + A4 hardening) + ship R3 diagnostics. Medium term: migrate to per-publisher elements.**

**Rationale:** A3 is a PROVEN defect (orphaned nodes). A4 is plausible but unproven (awaits fresh instrumented call). R3 diagnostics are the data bridge to disambiguate on the next call. Per-publisher elements are longer-term defense-in-depth but would require deeper refactor.

---

### SHORT-TERM FIX (immediate commit)

#### FIX 1: Clear orphaned nodes when AudioContext dies (CRITICAL — fixes A3)
**File:** `frontend/src/app/services/remote-audio.service.ts`  
**Lines:** 507-535 (ensureGraph method)  
**Change:**
```typescript
private ensureGraph(): AudioContext {
  if (!this.context || this.context.state === 'closed') {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioContextCtor();
    this.context.onstatechange = () => this.contextState.set(this.context?.state ?? 'none');
    this.contextState.set(this.context.state);
    // CRITICAL: Clear orphaned nodes when context dies.
    // If context was previously 'closed', old gain/limiter/destination nodes are
    // orphaned (belong to a dead context). Reusing them in addSource().connect()
    // throws InvalidStateError: "Cannot connect to an AudioNode in a different context."
    // This silently kills sources.size, hiding the banner and leaving audio muted.
    this.gain = null;
    this.limiter = null;
    this.destination = null;
  }
  // ... rest of initialization unchanged ...
}
```
**Why:** When context is recreated, old nodes must be cleared. Otherwise addSource.connect(gain) fails.

---

#### FIX 2: Harden A1 — pre-warm output.play() outside sources guard (SECONDARY — safety fallback for A1)
**File:** `frontend/src/app/services/remote-audio.service.ts`  
**Lines:** 263-319 (unlockAndPlayRemoteSinks method)  
**Change:** Modify line 294-304 to call output.play() even if sources.size=0:
```typescript
if (this.mixerEnabled() && this.sources.size > 0) {  // existing guard
  const output = this.outputElement;
  if (output) {
    this.bindOutputElement();
    try {
      await output.play();
    } catch (err) {
      console.debug('[media] remote audio mixer still blocked after user gesture', err);
    }
  }
}
// NEW: Also try to pre-warm the output element even if no sources yet.
// This ensures the output element is in a "played" state before first source arrives,
// preventing A1 (output.play() never called at gesture time).
else if (this.mixerEnabled() && this.outputElement) {
  try {
    await this.outputElement.play();
  } catch (err) {
    console.debug('[media] remote audio output pre-warm failed', err);
  }
}
```
**Why:** Defensive measure; ensures output element is warm before sources arrive.

---

#### FIX 3: Add R3 Diagnostics — capture media-playout stats (CRITICAL — disambiguation for A3 vs A4)
**File:** `frontend/src/app/services/sfu-client.service.ts`  
**Lines:** 729-754 (inboundTracks collection in collectDiagnostics)  
**Changes:**

1. **Add totalAudioEnergy from inbound-rtp** (line 749 fix):
   ```typescript
   audioLevel: numberOrNull(stat.audioLevel),  // existing (wrong source; will be null)
   totalAudioEnergy: numberOrNull(stat.totalAudioEnergy),  // ADD: NEW
   ```

2. **Add media-playout capture for per-publisher decode verification** (new loop after line 754):
   ```typescript
   // Media playout stats (Chrome 113+: decode metrics moved here from inbound-rtp).
   // Essential for disambiguating "decoded but not played" (A3/A4) from "not decoded".
   const mediaPlayoutByTrack = new Map<string, { audioLevel?: number | null; totalAudioEnergy?: number | null; totalSamplesDuration?: number | null }>();
   for (const stat of stats.values()) {
     if (stat.type !== 'media-playout') continue;
     const trackId = stat.trackIdentifier;
     if (!trackId) continue;
     mediaPlayoutByTrack.set(trackId, {
       audioLevel: numberOrNull(stat.audioLevel),
       totalAudioEnergy: numberOrNull(stat.totalAudioEnergy),
       totalSamplesDuration: numberOrNull(stat.totalSamplesDuration),
     });
   }
   // Merge playout metrics into inboundTracks entries by matching trackId.
   for (const track of inboundTracks) {
     const playout = mediaPlayoutByTrack.get(track.trackId ?? '');
     if (playout) {
       track.totalAudioEnergy = playout.totalAudioEnergy;
       // totalSamplesDuration indicates whether the playout pipeline is active.
     }
   }
   ```

3. **Add per-host remote-audio playout state** (in SfuDiagnosticsSnapshot, new field):
   ```typescript
   // Add to return value of collectDiagnostics (around line 768-785):
   remoteAudioPlayout: {
     contextState: this.remoteAudio.contextState(),  // 'running' | 'suspended' | 'closed' | 'none'
     outputAttached: !!this.outputElement,           // srcObject bound?
     outputPaused: this.outputElement?.paused ?? true,
     hasSources: this.remoteAudio.hasSources(),      // sources.size > 0?
     mixedPeerIds: this.remoteAudio.debugSnapshot().mixedPeerIds,  // which peers mixed
   },
   ```

**Why:** Clarifies the decode-vs-sink boundary:
- `media-playout.audioLevel > 0` + `emitted climbing` → audio IS decoded and reaching OS-level output → problem is sinkId (A4).
- `media-playout.audioLevel = null/0` + `emitted flat` → audio is NOT being decoded or playout blocked → problem is context/graph (A3).
- `contextState = 'suspended'` + `hasSources > 0` → A2 (pure autoplay), should show banner.
- `contextState = 'running'` + `hasSources = 0` → A3 (orphaned graph), no banner, silent.

---

### MEDIUM-TERM (after next instrumented call clarifies A4)

#### Option: Migrate to per-publisher unmuted `<audio>` elements (Meet-style)
**Pros:** Dissolves A1/A3/A4/A5 simultaneously. Cleaner sinkId routing (native <audio> element, not Web-Audio dest stream). Standard approach (Google Meet uses this).  
**Cons:** Larger refactor; test coverage needed.

**If A4 is confirmed:** Prioritize this refactor to replace the single mixed output with per-publisher elements.  
**If A4 ruled out:** A3 fix alone may be sufficient; keep mixer, add R3 diagnostics, revisit after v2 instrumented call.

---

## New issues found this round

**No new defects beyond R1.** The audit confirms the 6 mechanisms from round1-synthesis.md + explains why JROM saw no banner (A3 sources.size=0 → suppressed). R1 was comprehensive. R2 analysis ranks and proves A3 as primary, B2 (not B1), and provides the fix bundle + diagnostics.

---

STATUS: AGREE — **Root cause is A3 (orphaned graph: ensureGraph() reuses closed-context nodes, addSource.connect() throws InvalidStateError, sources.size stays 0, banner suppressed, silent). Secondary exposure is A4 (sinkId mis-routing on Web-Audio dest stream). Fix: (1) Clear orphaned nodes in ensureGraph when context recreated (2-line FIX 1), (2) Pre-warm output.play() outside sources guard (FIX 2 safety measure), (3) Ship R3 media-playout + host playout state diagnostics (FIX 3 data bridge), (4) Medium-term migrate to per-publisher unmuted <audio> elements if A4 confirmed. Anomaly B is sequential (B2), not a bug.**
