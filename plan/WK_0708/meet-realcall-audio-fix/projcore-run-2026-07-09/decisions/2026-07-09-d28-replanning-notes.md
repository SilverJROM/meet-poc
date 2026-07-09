---
source: coplanner B codex55
date: 2026-07-09
effort: meet-realcall-audio-fix
run: projcore-run-2026-07-09
priority: critical
search_hooks: [D28 replanning, AC15 early, sender liveness, branch recovery, absolute target loudness, T_gap real, relay low priority]
---

# D28 replanning notes - co-planner B

## Inputs read

- `realignment-from-north.md`
- `decisions/2026-07-09-codex55-consult-turn-refuted-sender-liveness.md`
- `og-requirements.md`
- `decisions/2026-07-09-north-voids-tgap-3400.md`
- `decisions/2026-07-09-harness-team-and-scope.md`
- effort `north-star.md`
- project `north-star.md` section 6 and surrounding standing decisions
- existing `plan.md`, `queue-batches.md`, and `topology.yaml`

## Findings

- B01-B07 are banked and stay verified. They are support work only in the D28 ledger: 0/18 ACs closed, 0/25 burn.
- The existing plan had the right atomic shape but three D28 violations: it put real T_gap ahead of AC15, allowed "local publisher level" as a gain reference, and treated AC4 mostly as detection plus generic recovery rather than branch-on-diagnosis recovery.
- AC15 must run immediately after B07 because it decides whether a frozen/non-advancing symptom is capture-dead or sender-dead-with-capture-alive. Without that discriminator, AC4 could "recover" the wrong subsystem and create another false green.
- TURN/relay remains useful but is not the 07-08 cause. A separate relay batch is retained as `B16R` after capture-path and gain gates are underway.
- AC18 is intentionally near the end. It proves loud degradation on TURN-mint failure but must not displace capture/sender recovery.

## Debates and decisions

1. Reuse `B04` or create `B04-real`?
   - Option A: mark B04 pending again.
   - Option B: keep banked B04 verified as code-only and add `B04-real` for real dual-browser T_gap.
   - Recommendation: Option B. It preserves the banked commit while making D27's voided number explicit.

2. Name the first D28 batch `B08A` or renumber all pending work?
   - Option A: renumber all pending work starting at B08.
   - Option B: insert `B08A` for AC15 and keep existing semantic B08 as the weak-signal sweep.
   - Recommendation: Option B. Banked IDs stay stable and the old B08/B09 discussion remains traceable.

3. Fold AC17 into B09 or split it?
   - Option A: B09 implements absolute target-loudness and includes one focused `>=3-party` guard.
   - Option B: split AC17 into a separate B09G by default.
   - Recommendation: Option A with a conditional split rule. The guard is part of the gain-fix safety contract, but if it widens B09 beyond 30 minutes, split to B09G before B10.

4. Gain reference.
   - Rejected: local publisher level. D28 names concrete failure modes: it chases the wrong source, amplifies quiet-remote noise floor, or punishes a good remote because the local speaker is loud.
   - Rejected: loudest remote. It is the degenerate mechanism under test in 2-party.
   - Recommendation: absolute target-loudness only, with noise gate/floor, smoothing, and max-gain cap.

## Co-planner convergence

- No conflicting opus co-planner artifact was present in the run `decisions/` directory at write time.
- If opus adds a conflicting note later, converge on the binding D28 constraints above: AC15 first net-new, AC4 branch-on-diagnosis, absolute target-loudness only, TURN/AC18 late.

## Files written

- `plan.md` rewritten with atomic rows and required `impl_tier`, `validator_tier`, `deliberation`, and `redteam` annotations.
- `queue-batches.md` rewritten to match the plan, with B01-B07 banked verified and D28 pending order.

---

# CONVERGENCE — co-planner A (opus), appended 2026-07-09

**Verdict: CONVERGED on B's shape and every binding D28 constraint.** AC15 first net-new, AC4
branch-on-diagnosis, absolute target-loudness only, AC16 mid/late, AC18 last-ish, B01–B07 banked,
`B04-real` split from banked `B04`, `B08A` insert rather than renumber — all agreed, no re-litigation.

I did not rewrite. I structural-checked B's plan **against the source** and found defects that are
invisible from the docs alone. Eight deltas below; **D1–D3 and D6 are blockers** (a batch that cannot
be executed as written, or that can report green on absent evidence). Patched into `plan.md` +
`queue-batches.md`. All code claims are cited to `file:line` at `08a369c`.

## Tier / atomicity audit (B's plan)

Passes: every row carries all four annotations; capture-path rows (B05, B07, B08A, B09, B10, B13) are
uniformly `L3 / L3 / deliberation: yes / redteam: standard`; no `sonnet`-validates-`sonnet` routing;
all `est_min <= 25`. Only the defects below required a patch.

## D1 (BLOCKER) — `B08A` is not atomic and cannot be executed in 25 min

As written it bundles four separable pieces: (a) a product-code stats reader **that does not exist**,
(b) a pure capture-vs-sender discriminator, (c) two independent injection primitives, and (d) a **live
far-end-transcribed-speech** assertion (which needs the spine in D2). Split into `B08A-1` (reader),
`B08A-2` (discriminator + dual injection = AC15's *discrimination clause*), `B08A-3` (AC15's *live
clause*, after the spine).

**AC15 stays the first net-new batch** — the mandate is honoured by `B08A-1`/`B08A-2` landing
immediately after B07 with **zero calls burned**.

## D2 (BLOCKER) — the evidence spine does not exist; every live AC is blocked on it

`RecordingArbiter` only **analyzes** a WAV already on disk (`analyzeRecording(recordingPath)`,
`e2e/harness/recording-arbiter.ts:232`). `e2e/harness/index.ts` exports ledger, arbiter, scheduler,
brain, gum-shim, capture-injection — **no call driver, no receive-side recorder, no transcriber.**
B01–B07 are all pure/unit-level modules.

Recording+transcript is the **sole** admissible evidence class for AC1, AC2, AC4, AC5, AC6, AC7, AC8,
AC9, AC15-live and AC16. Nothing produces it. B's plan has `B04-real` depend on `B08A` + `B03` but no
row builds the spine.

Not greenfield: `e2e/scripts/` holds adaptable legacy tooling (`r9-recorder-host.mjs`,
`capstone-record-host.mjs`, `speech-guest.mjs`, `longrun-orchestrator.mjs`, `measure-inbound-host.mjs`)
which already does dual-browser join, `--use-file-for-fake-audio-capture`, and per-participant capture.
**Two adaptation gaps, both real:** it records **`.webm`** (`r9-recorder-host.mjs:9`) while the arbiter
parses **WAV**; and it records via **the app's own recorder**, whose `/upload` is owner-gated (403) and
open-session-gated (409) and **rejects silently** (project north-star §6) — an unsound arbiter source.
The harness must capture receive-side audio itself.

Added `B08S-1` (dual-browser call driver) + `B08S-2` (receive-side recorder + transcript adapter → WAV
into `RecordingArbiter`), sequenced before `B04-real`, `B08`, and `B08A-3`.

## D3 (BLOCKER) — AC15 needs product code that does not exist; B's row implies it is already there

- `extractOutboundAudioSource()` returns **only** `{audioLevel, totalAudioEnergy}` — **no
  `totalSamplesDuration`** (`frontend/src/app/services/mic-energy.ts:92-105`). AC15 names it explicitly.
- `totalSamplesDuration` exists in the codebase only on **`media-playout`** (`sfu-client.service.ts:1289,
  :1297`, merged at `:2582`) — that is the **receive** side, the wrong subsystem.
- `hasOutboundAudioTrack()` checks outbound-rtp **existence only** and *deliberately* does not require
  `bytesSent > 0` (`sfu-client.service.ts:819-835`).

**Nothing in product code reads `packetsSent`/`bytesSent` deltas for sender health.** `B08A-1` must add
a `getOutboundLiveness()` reader over one `getStats()` pass returning both sides. B's row said
"collect ... during far-end-transcribed speech", which an implementer would read as *the stats are
already available*. Named explicitly now.

## D4 (SHARPENS D28.3) — `856104f` is not "wrong remedy" in the sender-dead arm; it is **blind**

`classifyMicCapture` returns **`'working'`** the moment `totalAudioEnergy` delta `>= epsilon`, *before*
it ever inspects level variance (`mic-energy.ts:175-176`). Its window is fed from the **capture-side**
`media-source` stat (`mic-energy.ts:89-96`).

So in the **sender-dead / capture-alive** arm, capture energy keeps advancing → classification is
`'working'` → the `micSilentWarning` banner never shows and `runMicRecoverySweep()` (R1,
`room.page.ts:3524`) **never fires at all**. `856104f` applies the *correct* remedy in the capture-dead
arm (both counters flat → `'silent'` → mic reacquire) and **does nothing whatsoever** in the sender-dead
arm: one-way audio persists with no detection, no banner, no self-heal — matching the 07-08 signature
(`micSilent=0`, 3 minutes one-way, never recovered).

Refines D28.3 rather than contradicting it, and it **changes AC4's fix contract**: the sender-dead
branch **cannot** be reached by branching inside R1's trigger, because that trigger never fires. A
**separate sender-liveness watchdog and trigger** is required. Added `B13W` (wiring) ahead of `B13`
(remedy). Recommend /north record this as a D28 addendum — it is a mechanism claim, and og-requirements
§4 AC4 currently implies a shared trigger.

## D5 (MECHANISM — saves a burned batch) — how to inject sender-dead with capture alive

`replaceTrack(null)` is **wrong**: it detaches the track, the `media-source` stat disappears, and the
capture counters stop too — indistinguishable from capture-dead. `sender.track.enabled = false` is
equally wrong (capture energy stops).

The faithful primitive is `sender.setParameters({encodings:[{...e, active:false}]})`: RTP halts while
the track stays attached, so `media-source.totalAudioEnergy` keeps advancing. Named in `B08A-2`.

## D6 (BLOCKER, arbiter integrity) — the stimulus verifier can false-PASS a dead mic

B05 finding **F2** (logged in `callbacks.md`, never queued): `verifyStimulus` has **no minimum-signal
floor**. A dead mic with a nonzero noise floor `n` gives `baseline = n`, `attenuated = 0.5n` →
`measuredGain = 0.50` → **PASS**. It catches digital silence only.

`B08` (sweep) uses this verifier as its `INVALID` gate. A false-PASS *in the gate itself* would let a
dead-mic run be reported as a valid sweep point — the exact false-green class D27 voided `T_gap` for.
**Must land before `B08`.** Added `B00F`.

## D7 (banked-verification integrity) — B01's tests do not execute

B05 finding **F4**: `e2e/harness/__tests__/call-ledger.test.ts` hand-rolls `test()`/`process.exit()` and
registers **zero vitest suites** (`vitest run harness/` → `1 failed | 5 passed`). B01 is banked VERIFIED
on assertions that **never run** under the suite. Not a B01 redo — its code stands — but the test must
be made real. Folded into `B00F` (L2, cheap).

## D8 (ramp trap) — `applyVolumeState` is the single writer for mute, user volume, **and** autoGain

`remote-audio.service.ts:676-685`. Moving it wholesale to `setTargetAtTime(tau≈2.5s)` (D18) would make
**mute take ~2.5 s** — press mute, keep hearing the room. `B10` must ramp **only the auto-gain
component** and keep mute/volume immediate (`cancelScheduledValues` + `setValueAtTime` on mute). Also
relax `AUTO_LEVEL_SMOOTHING = 0.35` (`:86`, applied per-tick in `computeRemoteAutoGains:117`) once the
AudioParam owns easing — otherwise double-smoothing silently *slows* the ramp, which D18 forbids.
Added to `B10`'s scope.

## D9 (de-risks B13) — the sender-dead remedies already exist; wire, don't build

`sfu-client.service.ts:1082-1094` already has `restartIce()` + `createOffer({iceRestart:true})` →
`PUT /api/sfu/renegotiate`. A full-republish path exists (`resetForTransportRecovery()` + full rejoin,
`:459-535`, epoch-guarded at `:139`/`:207`). `B13` reuses these; it does not invent them. This is what
keeps `B13` atomic after `B13W` absorbs the wiring.

## D10 (zero-cost, optional, parallel) — T1 may be decidable from banked evidence, no calls burned

`collectDiagnostics()` persists `outboundAudioSource` (`sfu-client.service.ts:1183`) and per-track
`bytesSent`/`packetsSent` (`:1220-1231`). The repo already replays real-session telemetry from fixtures
(`remote-audio-telemetry-replay.spec.ts:166,217,239` — sessions `11ee886f`, `2579eb8f`).

If session **`652c1475`**'s 185 stored events carry `outboundAudioSource.totalAudioEnergy` alongside the
frozen `outboundAudioLevel`, then **T1 (capture-dead vs sender-dead) is answerable from evidence we
already own, before spending one of the 25 calls** — and it tells us which AC4 branch actually matters.

Added `B08X`: **read-only**, ~20 min, parallel, `INCONCLUSIVE` is an acceptable outcome (the fields may
not have been persisted by the 07-08 build), **gates nothing**, closes no AC, and **never** deletes or
mutates `652c1475` (D26). Explicitly non-blocking so it cannot displace capture-path work.

## D11 (coverage hole) — AC3 was closed by no batch

A mechanical AC-coverage sweep of `plan.md` found **AC3 (ease-in / no instant blast) named in zero
acceptance cells.** `B10` is the ease-in batch but never claimed AC3 — so the req-matrix would have
shown AC3 permanently open while the work that closes it silently passed. Inherited from the
pre-D28 plan, not introduced by B. `B10`'s acceptance now reads "AC3 closes here" and restates the
limiter-is-a-backstop-never-the-proof rule.

All 18 ACs now map to a closing batch: AC1→B11, AC2→B12, AC3→B10, AC4→B13, AC5→B14, AC6→B15, AC7→B16,
AC8→B18, AC9→B19, AC10→B17, AC11→B20, AC12/AC13→B21, AC14→B21, **AC15→B08A-3**, AC16→B16R, AC17→B09,
AC18→B20T.

## D12 (parser hazard) — escaped pipes inside table cells

Two rows carried `\|` inside a cell (`B08A-2`'s four-state enum, `B00F`'s vitest output). Markdown
renders them, but coord's structural check splits rows on `|` and would mis-column exactly those two
rows — silently reading the *acceptance text* as `impl_tier`. Rewritten without pipes. Worth keeping as
a standing authoring rule for this plan format.

## Non-blocking note (not patched)

`B19` (10-min gate) at `est_min: 25` is tight — 10 min runtime plus recording/transcript analysis.
Raised to `30` and flagged against the 95/5 carve-out. `B18`'s 25 stands.

## Verification performed on the merged plan

- 32 rows in `plan.md` ≡ 32 rows in `queue-batches.md` (exact ID set match, no drift).
- All 32 rows carry `impl_tier` ∈ {L1,L2,L3}, `validator_tier` ∈ {L1,L2,L3}, `deliberation` ∈ {yes,no},
  `redteam` ∈ {no, yes(budget|standard|elite)}; every `est_min <= 30`.
- All 9 capture-path rows (B05, B07, B08A-1, B08A-2, B08A-3, B09, B10, B13W, B13) are uniformly
  `L3 / L3 / deliberation: yes / redteam: standard` — topology default honoured.
- Every `depends_on` resolves to a declared row (sole exception: B21's inherited prose escape hatch
  "…or budget exhausted", intentional).
- No `sonnet`-validates-`sonnet` routing: L3 impl (sonnet) always pairs with L3 validator (opus).
- All 18 ACs map to exactly one closing batch (D11).

## Standing disagreements

**None.** Every delta above is additive or a scope annotation; no D28 constraint is contested and no
banked row is reopened. If coord judges the spine (`B08S-1`/`B08S-2`) too large for the queue, the
correct response is to split it further — **not** to let `B04-real`, `B08` or `B08A-3` proceed without
it, because each would then close an AC on an evidence class it cannot produce (D27's exact failure).
