---
source: coplanner A (opus)
date: 2026-07-09
run: projcore-run-2026-07-09
batch: B08S-2
scope: design deliberation note (input to converged decision)
---

# Co-planner A dissent — B08S-2 capture hook

Agreed with B: hybrid label (D), provenance-not-amplitude, silence-writes-a-WAV,
fail-closed taxonomy, no synthetic WAV, stats-corroborate-not-arbitrate,
`addInitScript` not `evaluate`, live mutable state not install snapshots.

Dissent on **what is load-bearing**.

## 1. The registry is not needed for discovery — the shim is a strict superset

`sfu-client.service.ts:131` holds a single `private pc`, constructed at `:2186`
via the **global** `new RTCPeerConnection(...)`. `addInitScript` runs at
document-start, before any page script. Therefore **no PC predates the shim.**

A just-constructed PC has zero receivers and no applied SDP. A `track` listener
attached *synchronously inside the shim constructor* cannot miss anything: the
app only receives the `pc` reference after our listener is on it, and tracks
appear only after `setRemoteDescription`, strictly later.

So "tracks that already exist at join" and "tracks added by later
renegotiation" **collapse into one mechanism**. R3's invisible-PC failure was
caused by *late* install (`evaluate` after join), not by an intrinsic gap in A.

Any track in the app registry arrived via `ontrack` on a shimmed PC. The
registry can therefore only ever be a subset of what the shim already holds.
It adds zero discovery power.

## 2. Registry-as-authority is circular evidence

B's registry is updated from `processOntrack()`. If `processOntrack` is the
broken thing — exactly the D29 failure class B08S-2 exists to detect — the
registry is empty, and the harness reports INVALID instead of capturing the raw
track the shim is already holding.

**The product path must never be load-bearing for the evidence that tests the
product path.**

Consequence: **drop the product-code edits** from the implementation contract.
B08S-2 needs zero product change. `room.page.ts:684-697` already exposes
`sfuGetStats()` and `sfuSubscribedTracks()` as **live functions**. Read them
read-only into a `.meta.json` sidecar as corroboration. Never as capture, never
as discovery.

## 3. Mechanism B missed — it silently zeroes the capture

`sfu-client.service.ts:2190` does `this.pc.ontrack = (event) => {...}`.

If the shim assigns `pc.ontrack`, **the app overwrites it** and the hook
captures nothing, forever, with no error. The shim MUST use
`addEventListener('track', ...)`, which coexists with the app's handler.
(`:952` sets `this.pc.ontrack = null` on recovery teardown — likewise does not
detach `addEventListener` listeners.) This belongs on the do-not list.

## 4. Delete `pc.getReceivers()` from the shim constructor

B's step 3 retains it. A just-constructed PC has zero receivers. It is dead
code, and it is precisely what manufactured R3's false impression of
"existing-track coverage."

## 5. Two hardening gaps in the silence contract

- **Do not connect the capture graph before the first remote audio track
  arrives.** A `ScriptProcessorNode` connected to `destination` with no source
  emits all-zero buffers. That produces real sample frames with no real track —
  manufacturing "captured silence" out of no-capture, the exact false-green
  class we are fixing. Build the graph lazily on first audio track; count only
  samples after `firstTrackAtMs`; require `trackCount >= 1 && callbackCount >= 1`.

- **`AudioContext` may start `suspended`**, so `onaudioprocess` never fires and
  *every* run is INVALID. `resume()` and assert `state === 'running'` as a
  distinct INVALID reason; add `--autoplay-policy=no-user-gesture-required` to
  `DEFAULT_LAUNCH_ARGS` (`call-driver.ts:37`, harness-only flag).

## 6. Two smaller mechanism notes

- `ice-config.service.ts:97` constructs a **second** PC (ICE probe, relay
  policy). The shim wraps it too. Do not assume PC#1 is the SFU PC; attach to
  every PC and mix audio tracks from any of them.
- `Array.from(combinedSamples)` at stop serializes ~2.9M JSON numbers for a 60s
  call. Transfer Int16 PCM as base64 instead.
- Shim must preserve `prototype` and statics
  (`shim.prototype = original.prototype; Object.setPrototypeOf(shim, original)`)
  so `instanceof` and `RTCPeerConnection.generateCertificate` survive.

## Net

**Same option letter, different load-bearing.** A is the *sole* capture and
discovery path. App surfaces are read-only corroboration. Zero product edits.
