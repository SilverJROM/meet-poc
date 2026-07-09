PROPOSED — B08A-2

1. Mechanism diagnosis (grounded in a real-Chromium measurement, not assumption)

Before locking the classifier's four-way logic I ran a throwaway probe (real
Chromium, loopback RTCPeerConnection pair on 127.0.0.1, no room/SFU — deleted
after, e2e/ left clean) to measure what `totalAudioEnergy` and `packetsSent`
actually do under each candidate injection. This overturned my first guess and
the finding is load-bearing for the design, so stating it plainly:

  | injection                                   | totalAudioEnergy | packetsSent/bytesSent |
  |----------------------------------------------|-------------------|------------------------|
  | baseline (real fake-device audio)             | climbs            | climbs                 |
  | B07 Mode B (literal digital silence)          | **frozen**        | **keeps climbing**     |
  | B07 Mode A (frozen-nonzero DC offset)         | keeps climbing    | keeps climbing         |
  | `sender.setParameters({...e, active:false})`  | keeps climbing    | **frozen**             |
  | `track.enabled = false`                       | frozen            | keeps climbing (!)     |
  | `sender.replaceTrack(null)`                   | null (no stat)    | frozen                 |

Chrome does not run DTX on the outbound mic path here: RTP keeps flowing at a
steady cadence encoding silence even when the captured signal is literal
digital zero, and even when `track.enabled=false`. So the D29 prose ("capture
dead: stats frozen wholesale") does not hold at the raw stats level for a
literal-silence injection — only `totalAudioEnergy` freezes; `packetsSent`
does not. This is *consistent* with D29's own root mechanism (D4): a dead-mic
condition should read `totalAudioEnergy` flat / `packetsSent` still-advancing,
which is exactly what makes `classifyMicCapture` call it `'silent'` and R1
fire correctly for that case — the table row in D29 was a summary, not a
measurement; this probe is the measurement.

Consequence for `classifySenderLiveness`'s four states — mapped directly off
the two independent booleans (`captureAdvancing` from `totalAudioEnergy`
delta, `senderAdvancing` from `packetsSent` delta), matching
`classifyMicCapture`'s existing delta-over-window idiom
(`ENERGY_DELTA_EPSILON`, mic-energy.ts:198):

  - capture advancing AND sender advancing → `'both-advancing'`
  - capture advancing AND sender NOT advancing → `'sender-dead'` (confirmed:
    `setParameters(active:false)`)
  - capture NOT advancing AND sender advancing → `'capture-dead'` (confirmed:
    B07 Mode B / literal silence — this is the real signature a dead/silent
    mic produces on this stack, not "both frozen")
  - capture NOT advancing AND sender NOT advancing → `'indeterminate'` (a
    genuinely ambiguous quadrant on this stack — total link death, a closed
    PC, or insufficient window; never claim a specific single-sided fault
    here). Same bucket absorbs <2 usable samples for either metric (mirrors
    `classifyMicCapture`'s existing "insufficient data" handling).

This also explains the brief's "`replaceTrack(null)`/`track.enabled=false`
are WRONG for sender-dead" instruction precisely: both measured as capture ⇩ /
sender ⇩-ish (replaceTrack even nulls the capture stat outright) — i.e. they
read close to `capture-dead`'s own signature, not `sender-dead`'s. Using
either as the sender-dead injection would have produced a false/confounded
proof. `setParameters({encodings:[{...e, active:false}]})` is the only
mechanism of the six measured that cleanly isolates sender-dead (capture
climbs, sender flat) — matches the brief's binding choice exactly.

2. Files + why

  - `frontend/src/app/services/mic-energy.ts` — add pure
    `classifySenderLiveness(window: OutboundLivenessStats[], opts?) →
    'both-advancing' | 'capture-dead' | 'sender-dead' | 'indeterminate'`.
    Delta-over-window on `totalAudioEnergy` (existing `ENERGY_DELTA_EPSILON`)
    and `packetsSent` (new `SENDER_PACKET_DELTA_EPSILON = 1`, an integer
    counter). No caller wiring — exported, uncalled, same "dead-but-intended"
    status B08A-1's `getOutboundLiveness` had until this batch (B13W wires it
    later). `classifyMicCapture`/R1 untouched.
  - `frontend/src/app/services/sender-liveness.spec.ts` (NEW file, not
    appended to `mic-capture-health.spec.ts`) — that shared spec file aborts
    at a pre-existing stale assertion (L120, since `856104f`, flagged by the
    B08A-1 validator, untouched by B08A-1, out of scope for me too — verifier
    != fixer applies to unrelated pre-existing breaks same as it does to
    validators). A new isolated file guarantees these assertions actually
    execute rather than silently never running like B08A-1's did. Cases: all
    four states on clean synthetic windows, epsilon-boundary (sub-epsilon
    drift is noise, not advancing), insufficient-sample and null-field →
    indeterminate, mixed-null-then-numeric windows.
  - `e2e/harness/__tests__/b08a2-sender-liveness.browser.test.ts` (NEW) — real
    Chromium, no room/SFU/login, 0/25 call burn, same evidence tier as B07's
    `.browser.test.ts`. Two loopback `RTCPeerConnection` pairs (pc1 sends over
    real ICE on 127.0.0.1, pc2 receives — required because `outbound-rtp`
    stats only populate once media actually flows, confirmed by the probe):
      - Sender-dead: unmodified fake-device audio, sample a baseline window
        (assert real `classifySenderLiveness` → `'both-advancing'`), then
        `sender.setParameters({encodings:[{...e, active:false}]})`, sample a
        post window (assert → `'sender-dead'`).
      - Capture-dead: `page.addInitScript(modeBInitScript, …)` — B07's banked
        silent-hold pattern, imported from `../capture-injection.js`, reused
        exactly (not modified) — sample a window during the hold phase
        (assert → `'capture-dead'`); optionally also sample post-switch to
        the speech fixture (assert → `'both-advancing'`), mirroring B07's
        hold→post transition shape for a stronger proof at no extra call
        cost.
    Importing the REAL `extractOutboundLiveness` (B08A-1) and
    `classifySenderLiveness` (this batch) from
    `frontend/src/app/services/mic-energy.js` via a relative cross-package
    import — smoke-tested clean under this e2e vitest config (esbuild
    transpiles the plain TS file directly, no Angular/DOM deps triggered,
    since mic-energy.ts is documented framework-free). This is a deliberate
    departure from B07's "mirror the constant by hand" precedent: B07 mirrored
    *pre-existing, stable* app constants; here the function under test is
    *new in this batch*, so mirroring it would mean asserting a hand-copied
    reimplementation matches itself — no signal. Importing the real product
    function is strictly stronger evidence and is what the dispatch brief
    asked for ("Use B08A-1 APIs from 0ca6670"). `pc.getStats()` results
    aren't structured-clone-safe across `page.evaluate()`, so raw
    `[...report.values()]` entries come back as plain objects per sample
    tick; `extractOutboundLiveness`/`classifySenderLiveness` then run for
    real in Node against those entries (wrapped in a `{values: () =>
    entries.values()}` shim matching the extractor's own input contract).

3. Out of scope (per brief) — not touched: remedy, B13W watchdog wiring, live
   dual-browser AC15 (that's B08A-3, needs a far-end transcript), diagnostics
   page rendering, gain path, R1/classifyMicCapture.

4. Risks
   - Low-medium. New pure function + two new test files, zero product-runtime
     wiring (nothing calls `classifySenderLiveness` yet, so no behavior-change
     risk to any live path).
   - `SENDER_PACKET_DELTA_EPSILON` uses `packetsSent` only (not `bytesSent`)
     as the sender-liveness deciding metric, matching `classifyMicCapture`'s
     own precedent of one primary metric + threshold rather than an OR-merge
     of two counters; `bytesSent`/`totalSamplesDuration` stay in the type and
     are exposed for future corroboration but aren't part of the decision —
     will call this out plainly rather than let it be assumed symmetric.
   - Cross-package import (e2e → frontend) has zero existing precedent in
     this repo (checked: only comment-references exist today); smoke-tested
     working in isolation before committing to it. Flagging for
     redteam/validator to scrutinize specifically since it's a new pattern.
   - ICE loopback timeout risk in CI-like sandboxes (host-candidate-only,
     127.0.0.1) — same class of risk B07 already accepted for its Chromium
     launch; budget 45s per test like B07.

5. Estimate: ~28 minutes (at the 30 min hard cap — the empirical probe already
   spent is sunk cost from plan formation, not counted against this).

6. Tier confirm: L3 (sonnet), per §4b — matches.

7. Self-hygiene: No rooms/sessions/harness DB state touched. Probe script(s)
   used to ground this plan were deleted (`git status e2e/` confirmed clean)
   before writing this proposal. 652c1475/TEST_ROOM01 untouched.

STATUS: PROPOSED — awaiting APPROVED-PLAN. Logged to callbacks.md.
