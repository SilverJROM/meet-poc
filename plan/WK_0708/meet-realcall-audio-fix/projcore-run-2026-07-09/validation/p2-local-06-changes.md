# P2-LOCAL-06 changes — AC1 absolute target-loudness fix

## User Report

Verbatim (og-requirements §1): "the previous issue was that one of the joiner's volume is very low
that we cant hear her so i asked for a fix and this is the result" — the prior "fix" (the current
`computeRemoteAutoGains` amplifier) turned out to be a complete no-op on every 2-party call
(ReceiptBOT topology), proven numerically in P2-LOCAL-02.

## Root Cause

`computeRemoteAutoGains` (`frontend/src/app/services/remote-audio.service.ts`) computed `loudest`
as the max `audioLevel` across the *currently present remote publishers only*. In a 2-party call
there is exactly one remote publisher, so `loudest` always equals that peer's own level:

```
raw = max(1, min(2.5, (loudest * 0.88) / level))
    = max(1, min(2.5, (level * 0.88) / level))
    = max(1, 0.88)
    = 1.0   // unity, regardless of how quiet `level` is
```

The amplifier could only ever fire when a *second, louder* remote was present to serve as the
reference — the exact scenario that doesn't exist in a 2-party call, which is the client's real
topology.

## Formula — before / after

**Before:**
```ts
const loudest = usable.reduce((max, s) => Math.max(max, s.audioLevel), 0);
...
if (loudest > 0 && <sample usable>) {
  raw = max(1, min(2.5, (loudest * 0.88) / level));
}
```

**After (D28 — absolute target-loudness reference):**
```ts
const AUTO_LEVEL_ABS_TARGET = 0.5; // "normal" published loudness reference
const loudest = usable.reduce((max, s) => Math.max(max, s.audioLevel), 0);
const reference = Math.max(loudest, AUTO_LEVEL_ABS_TARGET);
...
if (<sample usable>) {
  raw = max(1, min(2.5, (reference * 0.88) / level));
}
```

`AUTO_LEVEL_ABS_TARGET = 0.5` is grounded in the existing test fixtures' "loud" reference points
(0.5/0.6, already treated as "normal loud" in the pre-existing multi-party tests) and in the real
07-08 call evidence, where JROM's healthy mic peaked at `audioLevel ≈ 0.497`.

Noise floor (`AUTO_LEVEL_NOISE_FLOOR`), max-gain clamp (`AUTO_LEVEL_MAX_GAIN = 2.5`), and
exponential smoothing (`AUTO_LEVEL_SMOOTHING = 0.35`) are all retained unchanged. The local
publisher's level is never used as a reference (per og-requirements binding constraint).

## Why AC17 (multi-party no-regression) holds

Whenever a genuinely loud peer is present (`loudest >= 0.5`), `reference == loudest` exactly as
before the fix — byte-identical gain output. The absolute floor only activates when
`loudest < 0.5` (2-party with a quiet remote, or an all-quiet multi-party call), which is
precisely the defect being fixed. The three pre-existing multi-party unit tests (loud peer at
0.5/0.6) pass unmodified.

## Behavior change (intentional)

- **2-party, quiet remote (e.g. level 0.1–0.3):** now boosted toward the absolute target instead
  of a permanent unity no-op.
- **Multi-party with a loud peer >= 0.5:** unchanged.
- **Multi-party where every peer is quiet (< 0.5), no peer meets the absolute target:** the
  loudest-of-the-quiet-peers is now also boosted toward the absolute target (previously held at
  unity). This is the correct extension of "absolute target-loudness reference" — a group that is
  entirely quiet should still be lifted, not just quiet-relative-to-each-other.

## Tests

- `e2e/harness/__tests__/remote-auto-gain.test.ts` — rewrote the `2-party single remote (no-op)`
  describe block (previously encoded the bug as passing behavior) into
  `2-party single remote — absolute target reference (D28 fix)`: boundary case (level=0.5 stays
  unity), boosted cases (0.3/0.2/0.1/0.05/0.02 → gain > 1.0), and a formula table with exact
  smoothed values. Updated two edge-case tests (`single sample preserves publisherClientId key`,
  `missing publisherClientId is handled safely`) whose single-remote fixtures (level 0.3) now
  correctly boost instead of no-op. All noise-floor and multi-party (loud-peer) tests are
  untouched and still pass with their original expected values.
  **Result: 28/28 passing.**
- `frontend/src/app/services/remote-audio.service.spec.ts` (RA-LEVEL-1) — updated the "loud"
  fixture from `0.1` to `0.5` so the test correctly exercises "loudest speaker >= absolute target
  is not boosted" rather than the old "loudest-of-an-all-quiet-group" case (which now legitimately
  gets boosted under the fix). **Result: passing** (`npx tsx remote-audio.service.spec.ts`).

## Scope

Unit-only (Phase 2 local, no SFU join). One product file changed (`remote-audio.service.ts`), two
test files updated. No local-publisher reference used. No AC3 ramp/AudioParam work touched.

## FE rebuild note

This is a product code change (`remote-audio.service.ts`). Per project deploy model, the frontend
is a prebuilt static bundle — this fix is **not live** until `ng build` runs and the bundle is
redeployed. Flagged for the deploy step; out of scope for this unit-gated batch.

## Files changed

- `frontend/src/app/services/remote-audio.service.ts`
- `frontend/src/app/services/remote-audio.service.spec.ts`
- `e2e/harness/__tests__/remote-auto-gain.test.ts`
