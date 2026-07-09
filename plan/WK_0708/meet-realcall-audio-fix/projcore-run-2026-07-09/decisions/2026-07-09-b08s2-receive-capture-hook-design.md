---
source: coplanner A (opus) + coplanner B (codex55) — converged
date: 2026-07-09
effort: meet-realcall-audio-fix
run: projcore-run-2026-07-09
batch: B08S-2
scope: design only
status: CONVERGED — no residual disagreement
search_hooks: [B08S-2, receive-side recorder, capture hook, RTCPeerConnection, addInitScript, addEventListener track, __meetDebug, sfu-client, ontrack, no capture, captured silence, INVALID, fail-closed]
---

# B08S-2 receive-side capture hook design

## Decision

**Option D (hybrid) — with a sharp constraint on what is load-bearing.**

- **Capture and discovery: Option A alone.** A navigation-persistent
  `page.addInitScript()` `RTCPeerConnection` constructor shim, installed on the
  receiver page **before any navigation**, attaching
  `pc.addEventListener('track', …)` **synchronously inside the shim
  constructor**. This is the *sole* path that discovers remote audio tracks and
  the *sole* path that produces PCM.
- **App/SFU surfaces (Option B): read-only corroboration only.** `sfuGetStats()`
  and `sfuSubscribedTracks()` are read at stop into a `.meta.json` sidecar to
  *classify* outcomes. They are **never** in the capture path, **never** the
  discovery authority, and their absence must never block WAV production.
- **Zero product-code changes.** B08S-2 is evidence-spine scope.

It is "D" only because app surfaces are read. It is "A" in every load-bearing
respect.

### Why the shim is sufficient for discovery (the fact that settles A vs B)

`addInitScript` runs at document-start, before any page script.
`sfu-client.service.ts:131` holds a single `private pc`, constructed at `:2186`
via the **global** `new RTCPeerConnection(...)`. No app code caches the
constructor at module scope; no PC is built in a Worker or iframe (verified).

A just-constructed PC has **zero receivers and no applied SDP**. The app only
receives the `pc` reference *after* the shim has attached its listener, and
tracks appear only after `setRemoteDescription`, strictly later.

Therefore **"tracks that already exist at join" and "tracks added by later
renegotiation" collapse into a single mechanism**: the constructor-attached
`track` listener. No track can precede it. R3's "existing PCs invisible" was
caused by *late* install (`page.evaluate` after join), not by any intrinsic gap
in constructor shimming.

Any track the app registry could report arrived via `ontrack` on a shimmed PC.
The registry is a strict **subset** of what the shim already holds. It adds zero
discovery power.

### Why the registry must not be the authority

A registry fed from `processOntrack()` is **circular evidence**. If
`processOntrack` is the broken thing — precisely the D29 failure class B08S-2
exists to detect — the registry is empty, and the harness would report INVALID
instead of capturing the raw track the shim is already holding.

**The product path must never be load-bearing for the evidence that tests the
product path.**

## Sequencing

1. `browser.newContext({ permissions: ['microphone','camera'] })` →
   `context.newPage()`. The receiver page exists and is **unnavigated**.
2. `installCaptureHook(page)` calls `page.addInitScript(hookFn, params)`.
   **Ordering guard:** assert `page.url() === 'about:blank'` and throw
   otherwise. This mechanically catches the R4 class (install-after-navigate).
3. `joinBrowser(page, roomUrl)` → `page.goto()`. The init script runs on the new
   document **before Angular boots**: it installs the state object
   `window.__b08s2ReceiveCapture` and replaces `window.RTCPeerConnection` with a
   shim that preserves `prototype` and statics.
4. Angular boots. `SfuClientService.publish()` reaches `:2186` and calls
   `new RTCPeerConnection(...)`. The shim constructs the real PC, attaches
   `pc.addEventListener('track', onTrack)` **synchronously**, increments
   `pcCount`, and returns the PC. Only then does the app assign
   `this.pc.ontrack = …` at `:2190` — which **coexists** with our listener.
5. SFU subscribe → remote SDP applied → `track` fires on both handlers. On the
   **first** remote audio track the shim **lazily** builds its capture graph:
   `AudioContext` (created, then `resume()`, then assert `state === 'running'`),
   a `GainNode` mixer bus, a `ScriptProcessorNode(4096, 1, 1)`, and a
   zero-gain node into `destination` so far-end audio is pulled without being
   played out. It records `firstTrackAtMs`. Every subsequent remote audio track
   connects its own `MediaStreamAudioSourceNode` into the **same** mixer bus.
6. The conversation runs. `onaudioprocess` appends copied `Float32Array` chunks
   and increments `callbackCount` / `sampleCount`.
7. Both browsers joined; publish validation passes.
8. `stopReceiveSideRecording()` disconnects the graph, reads the state object's
   **live** counters, and reads `sfuGetStats()` / `sfuSubscribedTracks()` as
   corroboration. It classifies (below), then either writes a WAV + `.meta.json`
   or throws with a named INVALID reason and writes **no WAV**.

Sample transfer is **Int16 PCM as base64**, decoded in Node. Never
`Array.from(Float32Array)` — a 60s call is ~2.9M JSON numbers.

Keep explicit references to every `MediaStreamAudioSourceNode` and the
`ScriptProcessorNode` on the state object; an unreferenced WebAudio node can be
collected and the capture goes silent with no error.

## Renegotiation Handling

- **Same PC, new track:** `track` fires again on the constructor-attached
  listener. Connect a new source into the existing mixer bus. Never rebuild the
  `ScriptProcessor`; the sample timeline stays continuous.
- **New PC (full rejoin / ICE restart / transport recovery):** the shim wraps
  *every* construction, so the new PC gets a listener at birth. The capture
  graph and buffers live on the **hook singleton**, not per-PC, so audio
  continues into the same buffer across the PC swap. `sfu-client.service.ts:952`
  sets `this.pc.ontrack = null` on recovery teardown — this does **not** detach
  `addEventListener` listeners.
- **`replaceTrack` on the sender:** no `ontrack` on the receiver; the existing
  source keeps producing. Already covered.
- **Multiple PCs:** `ice-config.service.ts:97` constructs a second PC for ICE
  probing. Attach to every wrapped PC; never assume PC#1 is the SFU PC. Mix
  audio tracks from any PC. Dedupe by `track.id`.
- **Page reload mid-capture:** `window` is fresh and buffers are lost. Track a
  `navCount` in the state object; `navCount > 1` during capture is
  `INVALID_RELOAD`, not silence.

## No-Capture vs Captured-Silence Contract

The invariant: **validity is decided by *provenance*, never by amplitude and
never by duration.** Silence and short captures are real evidence. Absence of a
real remote track, or a graph that never ran, is not evidence at all.

### VALID capture — write the WAV

Requires **all** of:
- `trackCount >= 1` (a real remote audio `MediaStreamTrack` was observed), and
- `callbackCount >= 1` (`onaudioprocess` actually fired), and
- `audioContextState === 'running'`, and
- every counted sample has `t >= firstTrackAtMs`.

Then classify energy downstream, **after** the WAV is written:
- **SPEECH** — RMS/peak above floor.
- **SILENCE** — real frames from a real remote track, near-zero energy. This is
  **valid evidence** that the far end received no usable speech. The product
  assertion FAILs; the harness does not. This is never INVALID.

### INVALID — throw, write no WAV, set no `receiveSideWavPath`

Each with a distinct named reason, so a harness bug is never mistaken for a
product bug:
- `INVALID_HOOK_MISSING` — state object absent or `installed !== true`.
- `INVALID_NO_PC` — `pcCount === 0`.
- `INVALID_AUDIO_GRAPH` — `trackCount >= 1` but `callbackCount === 0`, or
  `audioContextState !== 'running'`.
- `INVALID_RELOAD` — `navCount > 1` during capture.
- `INVALID_HOOK_BLIND` — `trackCount === 0` **but** `sfuGetStats()` shows
  inbound audio RTP. Media arrived and the hook missed it: a harness defect.

### PRODUCT_NO_MEDIA — product FAIL, no WAV

`trackCount === 0` **and** `sfuGetStats()` shows no inbound audio RTP. No media
ever arrived. Report as a product failure with the stats sidecar as evidence.
Do **not** write a WAV; there is nothing real to write.

This is the one place stats are load-bearing, and only to *disambiguate two
failures from each other* — never to certify success.

### The trap this contract closes

A `ScriptProcessorNode` connected to `destination` with **no source** emits
all-zero buffers. That yields real sample frames with no real track, which would
manufacture "captured silence" out of no-capture — the exact false-green class
this batch exists to kill. Hence: **build the capture graph lazily, only on the
first remote audio track**, and gate validity on `trackCount >= 1`.

## Minimal Implementation Contract

### Files

- **`e2e/harness/receive-side-recorder.ts`** — rewrite.
  - Keep the two-phase API: `startReceiveSideRecording()` before navigation,
    `stopReceiveSideRecording()` after publish validation.
  - Install with `page.addInitScript()`. Reuse the params discipline already
    proven in `e2e/harness/capture-injection.ts` (send-side gUM shim).
  - Shim: `shim.prototype = original.prototype;`
    `Object.setPrototypeOf(shim, original);` guard re-entry with
    `if (window.__b08s2ReceiveCapture) return;`.
  - The state object **owns** all mutable values. No closure duplicates, no
    install-time snapshots.
  - Export a **pure** `classifyCapture(state, stats)` returning the tagged union
    above, so the taxonomy is unit-testable without a browser.
- **`e2e/harness/call-driver.ts`**
  - Ordering guard: throw unless `page.url() === 'about:blank'` at install.
  - Add `--autoplay-policy=no-user-gesture-required` to `DEFAULT_LAUNCH_ARGS`
    (`:37`) so `AudioContext` cannot start `suspended`. Harness-only flag.
  - Return WAV/transcript paths only on VALID capture.
- **`e2e/harness/__tests__/receive-side-recorder.test.ts`** — new.
- **`e2e/harness/__tests__/call-driver.test.ts`** — temp-dir isolation.
  Each `describe` owns its dir via `mkdtempSync` in `beforeAll` + `rm` in
  `afterAll`. No shared `TEMP_DIR` const. (Fixes the R5 ENOENT.)
- **`frontend/**` — no changes.** `room.page.ts:684-697` already exposes
  `sfuGetStats()` and `sfuSubscribedTracks()` as live functions. Read-only.

### Tests

Unit (node, no browser):
1. `classifyCapture()` table-driven over all states. Assert **no INVALID row
   ever yields VALID**, and the silence row yields VALID.
2. `stopAndEncodeCapture()` throws for each INVALID reason and **leaves no
   `*.wav` on disk** (assert by directory listing, not by return value).
3. Source guard: the injected hook source contains no synthetic generator
   (`generateStubAudio`, `Math.sin`, zero-fill).

Browser (deterministic, local loopback PCs, no SFU):
4. **Nav persistence** — hook survives `page.goto()`. (Exists; keep.)
5. **Ordering guard** — install after navigation throws.
6. **`ontrack` coexistence** — page assigns `pc.ontrack = fn`; assert *both* the
   app handler and the hook listener fire. Direct regression guard for the
   `sfu-client.service.ts:2190` clobber.
7. **Existing-at-join + renegotiation** — track present at initial negotiation
   is captured; a track added later via `addTrack` + renegotiate is captured,
   **without reinstalling the hook**.
8. **Captured silence** — a real `MediaStreamTrack` from a zero-gain oscillator:
   WAV is written, RMS ≈ 0, classification SILENCE.
9. **No capture** — hook installed, no PC ever created: INVALID, no WAV.

Live acceptance (last, only after the above are green):
10. Real dual-browser call yields a receive-side WAV parseable by
    `RecordingArbiter`; `.meta.json` records `pcCount >= 1`, `trackCount >= 1`,
    `callbackCount > 0`, `inboundAudioPacketsReceived > 0`; RMS above the speech
    floor; transcript labeled `scriptExpected`.

### Gates before validation

```
npx vitest run e2e/harness/__tests__/receive-side-recorder.test.ts
npx vitest run e2e/harness/__tests__/call-driver.test.ts
npm test -w e2e -- harness/__tests__/call-driver.test.ts
focused tsc --noEmit on receive-side-recorder.ts + call-driver.ts
```

B08S-2 closes **no AC**. It is evidence spine only; it unblocks live AC evidence.

## Explicit Do-Not List

**Evidence integrity**
- Do **not** write a synthetic success WAV: no generated tone, noise, silence,
  fixture audio, or placeholder PCM when no real remote track produced samples.
- Do **not** treat synthetic or no-capture as PASS. It is `INVALID`, never
  `PASS`.
- Do **not** convert captured silence into no-capture because RMS is near zero.
- Do **not** treat `samples.length === 0` as silence.
- Do **not** gate validity on amplitude or on duration. Provenance only.
- Do **not** use WebRTC stats as the arbiter of success. Stats corroborate and
  disambiguate failures; the WAV is the arbiter.

**Hook mechanics**
- Do **not** assign `pc.ontrack` in the shim — the app overwrites it at
  `sfu-client.service.ts:2190` and the hook would capture nothing, silently and
  forever. Use `addEventListener('track', …)`.
- Do **not** call `pc.getReceivers()` in the shim constructor. A fresh PC has
  zero receivers. It is dead code, and it is exactly what manufactured R3's
  false "existing-track coverage" impression.
- Do **not** install the hook with `page.evaluate()`, before or after
  `page.goto()`. R4: navigation discards it.
- Do **not** read install-time snapshot fields. R5: the state object must own
  live mutable values.
- Do **not** connect the capture graph before the first remote audio track
  arrives.
- Do **not** assume PC#1 is the SFU PC (`ice-config.service.ts:97`).
- Do **not** capture from the app's mixer output (`graph.destination.stream`) —
  a suspended app `AudioContext` or `mutedAll` would masquerade as far-end
  silence. Capture the **raw remote track**. App playback health is a separate
  assertion (`remote-audio-playability.ts`).
- Do **not** make WAV production depend on `__meetDebug` existing.

**Scope**
- Do **not** change product code for B08S-2.
- Do **not** use the app's owner-gated recorder/upload path for evidence.
- Do **not** register WAV/transcript paths in `CallLedger` as created IDs;
  ledger ID types remain room/session.
- Do **not** close ACs from B08S-2.
- Do **not** re-gate the pending r6 commit (`735aad7`) against the old design.

## Failure History Incorporated

| Round | Commit | Design lesson |
|---|---|---|
| r1 | `5d7f652` | Synthetic `generateStubAudio()` produced a parseable voiced WAV with no remote audio. The false-green class is forbidden. |
| r2 | `cc07c56` | Fail-closed was right, but the live branch still needs syntax/type coverage; mocked Vitest alone is insufficient. |
| r3 | `5d16e08` | `getReceivers()` inside wrapper-created PCs sees nothing — a fresh PC has zero receivers, and a late wrapper cannot see earlier PCs. The fix is early install, not enumeration. |
| r4 | `32a1951` | `page.evaluate()` before `page.goto()` is discarded by navigation. Hook must be navigation-persistent; add an `about:blank` ordering guard. |
| r5 | `14b2f96` | `addInitScript` is the right primitive, but state must be live (not install snapshots) and each `describe` must own its temp dir. |
| r6 | `735aad7` | Not re-gated. Design was the defect; implementation resumes against this contract. |

## Co-planner A position (agree / amend / reject)

**Verdict: AMEND** — same option letter (D), inverted load-bearing.

| B's draft claim | A's position | Resolution |
|---|---|---|
| Registry is "authoritative" for PC/track discovery | **REJECT** — circular evidence; registry updates from `processOntrack()`, the exact path B08S-2 must be able to indict | Registry demoted to read-only corroboration in `.meta.json` |
| Registry needed because shim depends on "constructor-timing luck" | **REJECT** — with `addInitScript` no PC predates the shim; a fresh PC has zero receivers and no applied SDP, so a ctor-attached listener cannot miss a track | Shim is the sole discovery path; registry is a strict subset |
| Expose a new receive registry in `sfu-client.service.ts` + `room.page.ts` | **REJECT** — product-code change for an evidence-spine batch; surfaces already exist (`room.page.ts:684-697`) | Zero product changes |
| Keep `pc.getReceivers()` in the shim ctor (B step 3) | **REJECT** — dead code on a fresh PC; it manufactured R3's false coverage impression | Deleted |
| (absent from B's draft) | **AMEND** — shim must not assign `pc.ontrack`; app overwrites it at `sfu-client.service.ts:2190` | `addEventListener('track', …)` mandated |
| (absent from B's draft) | **AMEND** — graph built eagerly would emit all-zero buffers with no source, faking "captured silence" | Lazy graph on first audio track; `trackCount >= 1` gates validity |
| (absent from B's draft) | **AMEND** — `AudioContext` may start `suspended`, so every run would be INVALID | `resume()` + assert `running` + `--autoplay-policy=no-user-gesture-required` |
| D hybrid; provenance-not-amplitude; silence-writes-a-WAV; fail-closed taxonomy; no synthetic WAV; stats corroborate not arbitrate | **AGREE** | Retained verbatim in spirit |

**Final placement: A-primary.** `page.addInitScript()` `RTCPeerConnection`
constructor shim on the unnavigated receiver page, attaching
`addEventListener('track', …)` synchronously in the shim constructor. It is the
sole capture path *and* the sole discovery path. App surfaces are corroboration
only — they may explain a failure, never certify a success, and their absence
must never block WAV production.

**Renegotiation is still fully covered without a registry**, because the shim
wraps *every* `RTCPeerConnection` construction and the listener is attached at
birth:
- *Track added to an existing PC* → `track` fires again on the same listener →
  new source into the same mixer bus.
- *New PC from full rejoin / ICE restart / transport recovery* → the shim wraps
  it too; the capture graph and buffers live on the hook singleton, not per-PC,
  so the sample timeline survives the PC swap. (`:952`'s
  `this.pc.ontrack = null` teardown does not detach `addEventListener`
  listeners.)
- *Sender `replaceTrack`* → no receiver-side `ontrack`; the existing source keeps
  producing.
- *Second PC from `ice-config.service.ts:97`* → wrapped as well; attach to every
  PC, dedupe by `track.id`, never assume PC#1 is the SFU PC.

The registry could not have covered any of these cases *earlier* than the shim,
and in the one case that matters — a broken `processOntrack` — it would have
covered none of them at all.

## Co-Planner State

**Converged. No residual disagreement.**

Co-planner B (codex55) authored the first draft recommending D-hybrid with an
app/SFU registry as the *authoritative* discovery surface, requiring product-code
changes to `sfu-client.service.ts` and `room.page.ts`.

Co-planner A (opus) dissented on six points
(`decisions/2026-07-09-b08s2-coplanner-A-dissent.md`): the registry adds zero
discovery power over a document-start shim; registry-as-authority is circular
evidence; the shim must not assign `pc.ontrack`; `getReceivers()` in the
constructor is dead code; the capture graph must be built lazily; and
`AudioContext` may start suspended.

Co-planner B reviewed the code (`ice-config.service.ts`,
`sfu-client.service.ts`, `call-driver.ts`) and **agreed with all six**, stating:
"revise the converged file so D = addInitScript shim is sole capture/discovery
path; app surfaces are corroboration only; zero product changes for B08S-2."

Retained from B's draft: the D label, provenance-not-amplitude,
silence-writes-a-WAV, the fail-closed taxonomy, no-synthetic-WAV,
stats-corroborate-not-arbitrate, no owner-gated upload path, no `CallLedger` ID
registration, and closes-no-AC.

This is the contract for the next implementation batch.

## North approval (2026-07-09) — implementation guards

**DESIGN APPROVED.** Opus dissent is the key insight: addInitScript at document-start means no PC predates the shim; a track listener attached synchronously in the shim constructor cannot miss join-time or renegotiation tracks — they collapse into ONE mechanism. **r2–r6 were LATE INSTALL (evaluate after join), not a hard problem.** Record so nobody re-derives.

**Provenance not amplitude:** no-capture = INVALID; captured-silence = real WAV + real FAIL.

### THREE GUARDS (mandatory before/during impl)

1. **Constructor passthrough:** shim REPLACES global RTCPeerConnection but must pass constructor config UNMODIFIED (especially `iceServers`, `iceTransportPolicy`). Silent ICE corruption breaks AC16 (relay + forced relay). **Test:** shimmed PC still receives app's exact `RTCConfiguration`.

2. **Tee, don't intercept:** MediaStreamAudioSourceNode → (analysis/recorder) AND original playback path untouched. Capture must not mute/disconnect far-end hearing. **Assert far end still HEARS during capture.**

3. **AudioContext running:** resume for autoplay policy; assert `ctx.state === 'running'` before recording, else **INVALID** (not captured-silence FAIL). Digital silence from suspended context is no-capture INVALID.

**Routing:** codex55 FINAL gate of B08S-2 only; interim rounds sonnet-on-haiku.
