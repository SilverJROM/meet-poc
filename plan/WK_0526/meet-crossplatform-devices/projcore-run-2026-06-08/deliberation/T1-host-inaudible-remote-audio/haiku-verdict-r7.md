# Haiku verdict — T1 round 7

## Q1 — Implementation-completeness gaps

**Summary: 5 requirements are still ambiguous; an implementer will need clarification.**

| # | Requirement | Current spec | Ambiguity | Severity |
|----|-------------|--------------|-----------|----------|
| 1 | Banner "any el paused" tracking | "remoteAudioBlocked = (registry non-empty AND any el paused/blocked)" (line 31) | How is "any el paused" computed in the banner effect? Is it a computed signal iterating registry entries? Does the service emit an `anyElementPaused` signal? How does the effect reactively depend on all element paused states? | MEDIUM |
| 2 | B14 "re-check flag AFTER await" implementation | "check disposed flag before append+register; re-check the flag AFTER await, before append" (line 53) | What's the exact pseudocode? Does the flag prevent append, or prevent register, or both? If reset() runs between await completion and flag check, is it safe? | MEDIUM |
| 3 | B17 stateful diff implementation in signals | "syncPeers becomes a diff that calls addPublisher/removePublisher" (line 49) | How is prior-state tracked in a signal-based effect? The current syncPeers (remote-audio.service.ts:237-261) is a pure diff function. The new version must call addPublisher/removePublisher on changes, but effects are generally stateless. Options: (a) writable signal for priorStreams, (b) service method that compares registry vs current, (c) Angular computed with .previous(). **Not specified.** | HIGH |
| 4 | B17 stream change (track replace) handling | "exactly ONE element per publisher, key by clientId, dedup" (line 11) | If a peer's stream changes but clientId stays (track replace mid-call), does addPublisher update the existing element's srcObject, or remove-then-add? The diff effect must handle both. **Not specified.** | HIGH |
| 5 | B16 "media-playout without AudioContext" verification | "confirm media-playout getStats type is produced WITHOUT a Web-Audio AudioContext" (line 55) | The consensus says "If unavailable, degrade to inbound totalAudioEnergy rising AND element.sinkId==selected". But is this degradation acceptable, or must media-playout be confirmed working? The R3 diagnostics bundle assumes media-playout is available. **No clear requirement on what to do if it's not.** | MEDIUM |

**Impact:** Ambiguities #2, #3, #4 will require the implementer to make design decisions, risking inconsistency or bugs. These should be resolved in an implementer brief before coding.

---

## Q2 — Re-attack closers: B14/B17/B18/B19/B20

### B14 (reset-race guard) — **INCOMPLETE**

**Requirement:** "addPublisher checks a disposed flag before append+register; reset sets it first; re-check AFTER await."

**Gap:** The exact logic is underspecified. Pseudocode needed:

```typescript
async addPublisher(id, stream) {
  // Before await
  if (this.disposed) return;
  
  const el = create...;
  el.srcObject = stream;
  el.volume = ...;
  el.muted = ...;
  
  // CRITICAL: await can be long if setSinkId does device enumeration
  await this.setSinkId(el, ...);
  
  // After await — re-check, but how?
  if (this.disposed) {
    el.pause(); el.srcObject = null; el.remove();
    return; // don't register
  }
  
  // Now safe to append + register
  document.body.appendChild(el);
  this.registry.set(id, {stream, el});
}
```

**Attack:** What if reset() is called BETWEEN the re-check and the append? JS is single-threaded, so append would still happen after disposed=true. The flag prevents REGISTER, but not APPEND → orphaned DOM element.

**Fix needed:** Either (1) set the flag to prevent append (clearer), or (2) rely on the fact that reset() is called during state transitions where no in-call effects are running. The consensus doesn't guarantee (2).

**Verdict: INCOMPLETE — needs clarification on append-vs-register prevention.**

### B17 (wiring: syncPeers→registry) — **INCOMPLETE**

**Requirement:** "addPublisher/removePublisher are DRIVEN by the existing remote-streams effect; syncPeers becomes a diff."

**Current code:** room.page.ts:634-640 has a syncPeers effect, but it calls `remoteAudio.syncPeers()` which is the OLD mixer code. With the registry, syncPeers is GONE.

**Attack:** The effect needs to be rewritten to track remoteStreams and call addPublisher on changes. But how?

**Option A (stateless):**
```typescript
effect(() => {
  const current = sfuClient.remoteStreams();
  // How to get "prior"? We can't read prior state in an effect.
  // Option: service method that compares registry vs current
  remoteAudio.syncRegistryWithRemoteStreams(current);
});
```

**Option B (stateful signal):**
```typescript
const priorStreams = signal<Map>(new Map());
effect(() => {
  const current = sfuClient.remoteStreams();
  const prior = priorStreams();
  for (const [id, stream] of current) {
    if (prior.get(id) !== stream) remoteAudio.addPublisher(id, stream);
  }
  for (const [id] of prior) {
    if (!current.has(id)) remoteAudio.removePublisher(id);
  }
  priorStreams.set(new Map(current));
});
```

**Attack on Option A:** Service method must compare registry vs current. But the registry stores {stream, el}. The comparison `registry.get(id).stream !== current.get(id)` works, but the service needs to iterate BOTH registry and current, potentially causing confusion.

**Attack on Option B:** Writable signals in effects are unconventional in Angular signals architecture. The effect has a side effect (mutation of priorStreams signal), which breaks the pure-effect pattern.

**Neither option is elegantly specified. Consensus should pick and document one.**

**Verdict: INCOMPLETE — two implementation paths exist, both have drawbacks, choice not made.**

### B18 (setSinkId timeout) — **OK but with caveat**

**Requirement:** "Wrap setSinkId in withTimeout(~2s); on timeout, proceed to play()."

**Spec:** Clear. If setSinkId hangs, don't block playout; fallback to whatever sink is current (probably default).

**Attack:** If selected device times out and we use default device, the user gets silent-on-wrong-device WITHOUT A BANNER (play() succeeds, so no error). B20 diagnostics log the sinkId mismatch, but the user sees no UI indicator.

**Is this acceptable?** The consensus treats environment issues (device unavailability) as out-of-scope and detected-via-diagnostics. So yes, acceptable under that assumption.

**Verdict: OK** (design intent is clear, trade-off accepted).

### B19 (play() catch audit) — **OK**

**Requirement:** "EVERY play() call site MUST .catch()."

**Spec:** Clear pattern. Audit needed across:
- addPublisher (line 14)
- unlockAll (line 21)
- recoverVoicePlayout (line 25)
- recoverPlayback (implied)
- visibility/pageshow recovery (line 54)

**Attack:** This is a code-review requirement, not a design gap. Implementer must grep and verify.

**Verdict: OK** (pattern is clear).

### B20 (sink reject handling) — **OK**

**Requirement:** "Keep applyMediaElementSinkWithDefaultFallback; if BOTH fail, set blocked."

**Spec:** Use existing function (remote-audio.service.ts:85-112), which already falls back. Log effectiveSinkId in B16 diagnostics.

**Attack:** None found. Existing code handles this.

**Verdict: OK** (existing code sufficient).

---

## Q3 — In-scope silence sweep (Chrome, setSinkId-supported, JROM's environment)

**Question:** Any remaining path where the host gets silent remote audio WITH NO BANNER?

**Sweep:**

1. **setMutedAll(true) accidentally called** — all el.muted=true, el.volume=0 → SILENT, NO BANNER (elements not paused, just muted). User doesn't realize they muted it.
   - **Recovery:** None in-code (requires user awareness)
   - **B16 detection:** payload shows `muted=true` for all elements
   - **Verdict: SILENT-NO-BANNER PATH REMAINS** (low probability but possible)

2. **addPublisher not wired to removePublisher (B17 incomplete)** — if diff implementation is wrong, peers join but registry isn't updated → SILENT.
   - **Recovery:** None
   - **B16 detection:** registry empty (no elements)
   - **Verdict: POSSIBLE if B17 implementation is incorrect** (but this is an implementation bug, not a design gap)

3. **setSinkId timeout + default device unavailable** — setSinkId times out, element plays on default, default device is gone (OS exclusive or unplugged) → SILENT.
   - **Recovery:** applySpeakerDevice re-tries on device change
   - **B16 detection:** selectedSinkId != effectiveSinkId
   - **Verdict: ENVIRONMENTAL (out-of-scope per line 57-58)**

4. **reset-race orphan element** — if B14 logic is wrong, element appended but not registered → orphaned, never plays → SILENT, NO BANNER.
   - **Recovery:** None
   - **B16 detection:** registry empty but element in DOM (not visible in diagnostics without DOM inspection)
   - **Verdict: POSSIBLE if B14 implementation is incorrect**

5. **stream change (track replace) handling wrong** — if B17 doesn't handle stream changes, element continues to play old stream → SILENT (new stream is not connected).
   - **Recovery:** None
   - **B16 detection:** trackId in diagnostics would show old track
   - **Verdict: POSSIBLE if B17 implementation is incorrect**

**Summary:** Assuming B14/B17 implementations are correct, **only item 1 (setMutedAll) is a genuine SILENT-NO-BANNER path**. This is a UX gap (no visual mute indicator), not a bug. It requires:
- Either a UI indicator for mute-all state in controls-bar
- OR a safeguard that setMutedAll can only be called from a specific place (e.g., a mute button)

This is NOT addressed in v2.1.

---

## Q4 — Declare

**Finding:** v2.1 has:
- **3 implementation-completeness gaps** (ambiguities #1, #3, #4 from Q1)
- **1 genuine SILENT-NO-BANNER gap** (setMutedAll no indicator)
- **2 correctness dependencies** (B14 and B17 require careful implementation)

The design is sound but NOT implementation-ready without resolving these. An implementer would get stuck or make wrong decisions on ambiguities #3 and #4, potentially reintroducing SILENT-NO-BANNER paths via buggy B17 diff logic.

**STATUS: REVISE — Design v2.1 is architecturally sound but NOT implementation-ready. Two critical blocks: (1) B17 diff implementation in signals must be specified (Option A: service compare method vs Option B: stateful prior signal), (2) setMutedAll(true) creates a SILENT-NO-BANNER path with no UI indicator (need visual mute state or safeguard on who can call it). Also: B14 flag logic and banner "any paused" tracking need pseudocode. Recommend resolving these in an implementer brief before coding, OR accept that the implementer will make design decisions that might not align with the arch intent.**
