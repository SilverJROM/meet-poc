# B08A-1 — Independent Validation (L3 / opus)

**Verdict: PASS** — with one MUST-TRACK carry-forward that is *not* B08A-1's defect.

Validator: L3 (opus), independent. Verifier ≠ fixer — no product code written or modified.
Commits reviewed: `0ca6670`, `d7edd39`. Evidence class: unit/fixture tests + code read of the
diagnostics payload path. Live call not required for this batch (per brief).

**Closes NO AC.** AC15 remains open until B08A-3 (live far-end transcript).

---

## Gate checks

### 1. Q0 — batch acceptance → assertions present

| Acceptance element | Assertion | Verified |
|---|---|---|
| Four counters extracted | U-33 (`mic-capture-health.spec.ts`) | ✅ re-run in isolation |
| Null-safe (non-number → null; missing types → null; never throws) | U-34, U-35 | ✅ re-run in isolation |
| ONE `getStats()` — `getOutboundLiveness()` | `getStatsCalls === 1` (`sfu-client.spec.ts`) | ✅ mutation-proven |
| ONE `getStats()` — `collectDiagnostics()` | `getStatsCalls === 1` (pre-existing guard) | ✅ mutation-proven |
| Fields on outbound **audio** track only | `audioOut?.totalAudioEnergy === 91.2`, `videoOut?.… === undefined` | ✅ mutation-proven |
| No `media-source` → `null`, not `undefined` | `missing.diagnostics?.outboundTracks[0]?…` | ✅ present and passing |

Every acceptance element maps to a live assertion. No orphaned claims.

### 2. Tests run (not taken on trust)

```
npx tsx src/app/services/sfu-client.spec.ts        → exit 0
npx tsx src/app/services/mic-capture-health.spec.ts → exit 1  (pre-existing, see §5)
npx tsc --noEmit -p tsconfig.app.json               → exit 0
```

Because the whole-file failure at §5 aborts `mic-capture-health.spec.ts` before U-33..U-35, I
re-verified those three cases **in isolation** against the real `mic-energy.ts` (throwaway script,
deleted afterwards) — all three pass. I did **not** stop at reproducing the implementer's claim; I
added four adversarial cases of my own:

| Extra | Probe | Result |
|---|---|---|
| V1 | Actual `null`/`undefined` entries in the report — exercises the `if (!stat) continue` guard that U-35's comment *claims* to cover but never actually feeds | PASS |
| V2 | Two audio `media-source` + two audio `outbound-rtp` entries → first-wins, deterministic | PASS |
| V3 | `outbound-rtp` **before** `media-source` → early-`break` must not skip the capture pair | PASS |
| V4 | Kind-less `media-source` + video-only `outbound-rtp` → no false-positive extraction | PASS |

V1 is worth naming: U-35's comment says "malformed entries (null/undefined in the report) must not
throw", but its fixture contains neither a `null` nor an `undefined` entry — it passes a well-formed
object. The guard is correct (V1 proves it), but the test does not test what its comment says.
Cosmetic test-hygiene nit, not a defect.

### 3. Mutation testing — do the assertions actually *guard*?

Passing tests prove nothing if they'd pass against broken code. Run in a throwaway worktree (removed):

| Mutation | Expected kill | Result |
|---|---|---|
| Merge onto `stat.kind === 'video'` instead of `'audio'` | audio-only merge | ✅ killed — *"capture-side energy merged onto the audio outbound track"* |
| Drop the merge entirely | fields present at all | ✅ killed — same assertion |
| Replace reused `stats` with a second `await pc.getStats()` | one-getStats invariant | ✅ killed — *"collectDiagnostics must use exactly one getStats call", 2 !== 1* |

All three die on the *correct* assertion. The tests are load-bearing, not decorative.

> Process note: my first mutation run reported `exit=1` for both mutants, but the worktree had no
> `node_modules` — they were dying on `ERR_MODULE_NOT_FOUND`, not on an assertion. Symlinking
> `node_modules` and re-establishing a green baseline first turned this into a real result. Recording
> it because "exit != 0" would have been a false confirmation.

### 4. Scope bounds — `classifyMicCapture` / R1 untouched

- Diff over `frontend/` greps clean for `classifyMicCapture`, `nextMicWarningState`,
  `decideMicRecovery`, `runMicSweep`, `room.page` — **zero** changed lines.
- Exactly 5 product files touched, as claimed.
- No control-flow anywhere reads the new fields. The only `totalSamplesDuration` consumers outside the
  5 files are `diagnostics.page.*`, which read it off `mediaPlayout` (call-wide playout), a
  **different** object from the new per-outbound-track field. No collision, no behavior change.
- `getOutboundLiveness()` currently has **no callers** — dead-but-intended (harness reader lands in
  B08A-2). Consistent with "reader + emit only".

### 5. Pre-existing `mic-capture-health.spec.ts` failure — bisected

Per gate check 5 this is **not a B08A-1 FAIL**. Confirmed unrelated, and I went further and found
its origin:

- Fails identically at `08a369c` (pre-B08A-1, zero B08A-1 code) — assertion
  *"flat energy + high level -> not silent"*, `actual: 'silent'`.
- Bisected: **`856104f` "fix(voice): detect frozen non-zero mic level as silent (Mode-A blind spot)"**
  introduced it. Its parent `6f25eb2` is green. That commit deliberately changed `classifyMicCapture`
  so flat-energy + high-level now classifies as `silent` — and left the old, now-contradictory
  assertion in place. **Stale test, not a live product bug.**

**Consequence, and the reason this is MUST-TRACK:** `mic-capture-health.spec.ts` aborts at L120/121.
Every assertion after that line has not executed since `856104f` — that includes B08A-1's new
U-33..U-35 *and* the older U-20..U-32 from batches 2b/2c. The file has been silently red for several
batches. B08A-1's new extractor tests are **dead-on-arrival as regression guards** until L120 is
fixed. The code is correct (I proved it out-of-band); the *guard* is not running.

This failure is referenced **only** inside B08A-1's own artifacts — it is not in `queue.md`, not in
`progress.md`, not in any decision doc. Recommend injecting a micro-fix issue: reconcile the L120
assertion with `856104f`'s intended semantics. Not B08A-1's to fix (out of scope, verifier ≠ fixer).

### 6. Red-team CLEAN — corroborated, with one gap closed

I agree with the red-team's six lenses. It missed one check that could have made D29 silently useless,
so I ran it:

**Does the backend actually persist the four new fields, or strip them at a schema boundary?**
D29's whole rationale is "a real call, not just the harness, can discriminate capture-dead vs
sender-dead" — that fails if the payload is whitelisted server-side. Traced end-to-end:

`collectDiagnostics()` → `room.page.ts:3982 flushDiagnosticsLog` → `buildDiagnosticsPayload`
(`payload.sfuDiagnostics = sfuDiagnostics`, whole snapshot) → `appendDiagnostics` →
`store.ts:514 normalizeDiagnosticsPayload` (**pass-through spread, no whitelist**) →
`payloadJson: JSON.stringify(persistedPayload)` (everything minus `clientKey`) → `payload_json` column.

**The four counters reach persistent storage verbatim.** D29's stated purpose holds end-to-end, not
merely at the FE snapshot object. This is the strongest evidence in the batch and it was previously
unverified by anyone.

Note for B08A-3: the fields land in the *persisted payload*, but `diagnostics.page.html`'s
per-outbound-track rows do not render them. Fine for AC15a (explicitly not a UI-visible AC), but if
the live-call triage flow expects to *read* T1 off the diagnostics page, that surfacing is still owed.

---

## Findings

| # | Severity | Finding |
|---|---|---|
| 1 | **MUST-TRACK (not B08A-1)** | `mic-capture-health.spec.ts` red since `856104f` (stale assertion contradicting that commit's intended semantics). Aborts the file, so U-20..U-35 — including B08A-1's new tests — have not run in CI for several batches. Untracked in the run. Recommend queue injection. |
| 2 | Nit | U-35's "malformed entries (null/undefined)" fixture contains no `null`/`undefined` entry. Guard is correct (proven), comment overstates the fixture. |
| 3 | Observation | `extractOutboundLiveness()` computes `packetsSent`/`bytesSent` that `collectDiagnostics()` discards (per-track values win). Harmless shared-signature cost; red-team flagged the same. |
| 4 | Observation | Merge keys on `stat.kind === 'audio'` while `track.kind` resolves as `publishTrack?.kind ?? stat.kind`. Divergence is unreachable for real `outbound-rtp` stats (always carry `kind`), but a consumer filtering on `track.kind` is trusting a second source. Worth a glance in B08A-2. |

No correctness defect. No scope violation. No overclaim in `changes.md` — every claim I checked held,
including the ones I expected to find soft (`getStatsCalls`, the isolation-verified U-33..U-35, and
the "grep-confirmed 5 files" bound).

---

## Verdict

**PASS.** B08A-1 delivers exactly what it claims: a null-safe one-pass sender-liveness extractor, a
null-safe service reader, and a D29 diagnostics emit that provably lands on outbound **audio** tracks
only and provably survives to the persisted `payload_json`. Assertions are mutation-proven to guard.
`classifyMicCapture` / R1 are untouched. Closes no AC — AC15 correctly deferred to B08A-3.

Cleared for B08A-2 (`classifySenderLiveness` + dual injection), with Finding 1 tracked separately so
the new extractor tests start actually running.

---

**Validator:** L3 / opus (independent — did not implement)
**Date:** 2026-07-09
**Commits:** `0ca6670`, `d7edd39`
**Worktrees created for mutation/bisect testing: removed. Product tree left clean (`git status` on `frontend/`, `backend/` empty).**
