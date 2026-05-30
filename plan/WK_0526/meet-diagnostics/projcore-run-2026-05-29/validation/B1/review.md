# Review — B1: Local mic-energy metric in diagnostics (R1)

**Batch:** B1
**Branch:** `feat/meet-diagnostics-audio-20260529`
**Commit under review:** `706813d` (only commit beyond baseline `81661dd`)
**Requirement:** R1 — every diagnostic `sample` must carry real, non-null `outboundAudioLevel`, `outboundAudioEnergy`, `micSilent` on ALL clients.
**Reviewer:** [reviewer] · **Date:** 2026-05-30

---

## Verdict: APPROVE

> **REVISE-1 resolved** (`3c1ebff`). The original REVISE verdict (below) flagged ONE correctness defect — the Check-2 iteration-order hazard. Dev hoisted the media-source capture into its own dedicated loop, separate from the break-terminated candidate-pair loop. Re-verified: all 8 checks now PASS. See **## Re-Review (REVISE-1)** at the bottom of this file for the four confirmations + evidence. Original REVISE analysis retained below for the record.

### Original verdict (REVISE — superseded by `3c1ebff`)

One **correctness defect** confirmed (Check 2 — the iteration-order hazard the lead flagged). Everything else passes. The derivation logic, the truth-table conformance, the ground-truth wiring, the scope discipline, and the changes.md are all clean. The single blocker is real and silently regresses R1 to `null` on browsers whose `RTCStatsReport` happens to iterate the nominated candidate-pair before the audio `media-source` stat.

---

## Codex-Template Section Check (changes.md)

| Section | Present | Note |
|---------|---------|------|
| User Report (verbatim) | PASS | R1 quoted verbatim from og-requirements (changes.md:11) |
| Root Cause (mechanism) | PASS | Two-part mechanism: hardcoded nulls at payload site + producing `media-source` stat never read in the getStats pass (changes.md:17-23). Mechanism-level, not symptom. |
| Code Changes (per-file WHAT+WHY) | PASS | All 5 files, WHAT+WHY each (changes.md:29-52) |
| Verification (build + smoke) | PASS | BE tsc EXIT=0, FE bundle EXIT=0, unit EXIT=0, SC-6 static grep, SC-I1 structural (changes.md:74-104). Manual path described as expected (no live two-client run — acceptable; feature has no UI repro). |
| Caveats (regression vs pre-existing) | PASS | Pre-existing sfu-client.spec failure called out; graceful-absence, call-start transient, resolved semantics all documented (changes.md:114-120) |

changes.md is complete. (The truth-table fix below is NOT yet reflected in changes.md because the code is not yet fixed.)

---

## Per-Check Table

| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | `deriveOutboundAudioFields` matches resolved truth-table exactly; micSilent never uses totalAudioEnergy; partial-stats (audioLevel null) -> micSilent null | **PASS** | `mic-energy.ts:48-50` TT-E all-null; `:53-60` TT-C muted -> passthrough-or-null + micSilent TRUE; `:64-66` TT-D no-source -> all null; `:71-74` TT-A/B micSilent = `audioLevel < MIC_SILENCE_LEVEL_THRESHOLD` (0.01, `:31`), driven by instantaneous `audioLevel` only; `:71` partial `audioLevel` non-number -> `null`. Spec `mic-energy.spec.ts` exercises every row incl. SC-5 (energy-irrelevant both directions, `:62-76`) and partial-stats (`:82-91`). Ran the spec: `mic-energy: all assertions passed` EXIT=0. |
| 2 | **CRITICAL iteration-order hazard** — media-source capture inside the candidate-pair loop that `break`s | **FAIL** | **Confirmed real defect.** `sfu-client.service.ts:336` opens `for (const stat of stats.values())`; the `media-source`/`kind==='audio'` capture is at `:337-343`; the candidate-pair branch at `:344` ends with `break` at `:362`. RTCStatsReport iteration order is not spec-guaranteed. If a nominated/succeeded candidate-pair is iterated before the audio media-source stat, the loop `break`s at `:362` and `outboundAudioSource` stays `null` (`:334`) -> R1 silently regresses to all-null on those browsers. The file's own convention is a SEPARATE loop per stat type: outbound-rtp loop at `:370`, inbound-rtp loop at `:387`. Fix below. |
| 3 | No second `pc.getStats()` in collectDiagnostics (exactly one) | **PASS** | Inside `collectDiagnostics()` (`:285-436`) there is exactly one `pc.getStats()` at `:309`. The other matches (`:183` is the separate public `getStats()` method `:182-184`; `:195` is in a different method) are outside collectDiagnostics. The recommended fix in Check 2 reuses the SAME `stats` report — no new getStats call. |
| 4 | `outboundAudioSource` present in success return AND both early returns | **PASS** | Success return `:432`; early return (`!pc \|\| !publishState`) `:301`; early return (getStats catch) `:322`. All three set the field. Type added to `SfuDiagnosticsSnapshot` at `meeting-sessions.service.ts:328`. |
| 5 | room.page reads GROUND-TRUTH track state (readyState==='live' + enabled), not micOn(); replaces all 3 hardcoded nulls | **PASS** | `room.page.ts:2430` `const audioTrack = this.media.localStream()?.getAudioTracks()[0] ?? null;` then `:2431-2435` `hasLiveAudioTrack: !!audioTrack && audioTrack.readyState === 'live'`, `micEnabled: audioTrack?.enabled ?? false`. No `micOn()` in the path. The three nulls at former 2443-2445 now read `micFields.outboundAudioLevel/Energy/micSilent` (`:2450-2452`). |
| 6 | Scope: exactly 5 files, surgical, no scope creep; B2/B3/B4, SFU/transport, lobby AnalyserNode preview meter untouched; no new AudioContext/AnalyserNode | **PASS** | `git show --stat` = exactly 5 files (room.page.ts, meeting-sessions.service.ts, mic-energy.ts NEW, mic-energy.spec.ts NEW, sfu-client.service.ts). `media.service` (lobby `startMicLevel`/AnalyserNode meter) NOT in diff. `grep AudioContext\|AnalyserNode mic-energy.ts` -> zero matches; same grep over the whole diff -> zero matches. No B2/B3/B4 surfaces touched. |
| 7 | changes.md has all Codex sections | **PASS** | See section-check table above — all five sections present and substantive. |
| 8 | Lifecycle deferral-OFF respected: no TODO/FIXME/dead-code in diff | **PASS** | Grep of added (`^+`) lines for TODO/FIXME/XXX/HACK/@deprecated -> zero. The only `console.log` in the diff is the spec's terminal `console.log('mic-energy: all assertions passed')` (`mic-energy.spec.ts:95`) — standard for the node-assert spec convention mirrored from `sfu-client.spec.ts`, not dead code. |

---

## Scenario Coverage + Brief Anchoring

| Scenario | Covered | Anchors to |
|----------|---------|------------|
| SC-1 / TT-A audible | YES — `mic-energy.spec.ts:5-15` | R1 (AC1/AC3) |
| SC-2 / TT-C muted (enabled=false) | YES — `:17-28` | R1 truth-table TT-C |
| SC-3 / TT-B near-zero level | YES — `:30-40` | R1 truth-table TT-B |
| SC-4 / TT-E no live track | YES — `:42-50` (`assert.doesNotThrow`) | R1 truth-table TT-E |
| TT-D graceful absence | YES — `:52-61` | R1 truth-table TT-D |
| SC-5 instantaneous-not-cumulative | YES — `:63-77` (both directions) | R1 design constraint |
| Partial-stats audioLevel null | YES — `:79-90` | R1 partial-stats rule |
| SC-6 no AudioContext (static) | YES — grep clean | R1 design constraint |
| SC-I1 single getStats + media-source branch | PARTIAL — branch present, single getStats confirmed, **but Check 2 defect means the branch is reachable-conditionally, not unconditionally** | R1 wiring |
| SC-I2 no hardcoded null | YES — `room.page.ts:2450-2452` | R1 wiring |

Every code change traces to R1. No out-of-scope work. The wiring (SC-I1) is structurally present but undermined by the Check 2 hazard.

---

## Required Changes (REVISE)

**R-1 (blocker) — Hoist the media-source capture out of the break-terminated candidate-pair loop.**

`frontend/src/app/services/sfu-client.service.ts:337-343` — the `media-source`/`kind==='audio'` capture currently lives inside the `for (const stat of stats.values())` loop that `break`s at `:362`. Remove it from that loop and give it its OWN loop over the same `stats` report (matching the file's existing per-stat-type loop convention at `:370` and `:387`). Reuse the SAME `stats` — do NOT add a second `getStats()`.

Concretely:
1. Delete the `if (stat.type === 'media-source' ...) { ... }` block at `:337-343` from the candidate-pair loop.
2. Add a dedicated loop after the candidate-pair loop closes (`:364`) and before/around the outbound-rtp loop, e.g.:
   ```ts
   for (const stat of stats.values()) {
     if (stat.type !== 'media-source' || (stat as any).kind !== 'audio') continue;
     const s = stat as any;
     outboundAudioSource = {
       audioLevel: typeof s.audioLevel === 'number' ? s.audioLevel : null,
       totalAudioEnergy: typeof s.totalAudioEnergy === 'number' ? s.totalAudioEnergy : null,
     };
   }
   ```
   (The `let outboundAudioSource ... = null;` declaration at `:334` stays where it is.)

This makes the capture order-independent: the candidate-pair `break` can no longer skip it, so `outboundAudioSource` is populated on every browser regardless of `RTCStatsReport` iteration order.

After the fix: re-confirm `git show --stat` still touches only the 5 files, rebuild FE (expect EXIT=0), re-run `npx tsx src/app/services/mic-energy.spec.ts` (the pure helper is unchanged so it still passes), and update `changes.md` Code Changes §2 to describe the dedicated media-source loop instead of the in-line branch.

---

## Concerns (non-blocking, no action required for this batch)

- **Call-start transient** (changes.md:118): the first sample(s) after join may read `micSilent: true` before `audioLevel` ramps. By-design for B1 (per-sample raw truth); B2 owns debouncing. Acceptable.
- **Pre-existing** `sfu-client.spec.ts` failure (~line 89) is unrelated and untouched. Not a B1 regression.
- The `(stat as any)` casts at `:337-341` are necessary — `RTCAudioSourceStats` (`audioLevel`/`totalAudioEnergy`/`kind`) is not in the lib.dom `RTCStats` union. Consistent with existing `as any`-free stat access elsewhere being typed; acceptable given the type gap.

---

STATUS: REVISE — `frontend/src/app/services/sfu-client.service.ts:337-343`: the `media-source`/`kind==='audio'` capture sits inside the candidate-pair `for` loop that `break`s at `:362`. RTCStatsReport iteration order is not spec-guaranteed, so when a nominated/succeeded candidate-pair is iterated before the audio media-source stat the loop breaks early, `outboundAudioSource` stays null (`:334`), and R1 silently regresses to all-null on those browsers. Fix: hoist the media-source capture into its OWN loop over the same `stats` report (one dedicated `for (const stat of stats.values()) { if (stat.type !== 'media-source' || kind !== 'audio') continue; ... }` after the candidate-pair loop closes at :364), matching the file's existing per-stat-type loop convention (outbound-rtp :370, inbound-rtp :387) — no second getStats() call. All other 7 checks PASS.

---

## Re-Review (REVISE-1)

**Re-review of:** `3c1ebff` (the REVISE-1 fix) on top of `706813d`.
**Reviewer:** [reviewer] · **Date:** 2026-05-30
**Scope:** Verify ONLY that the Check-2 finding is resolved; the other 7 checks are not re-litigated (they passed in the original review against `706813d`, which `3c1ebff` does not touch except for the one fixed loop).

| # | Confirmation | Verdict | Evidence |
|---|--------------|---------|----------|
| 1 | media-source/`kind==='audio'` capture now in its OWN dedicated loop, SEPARATE from the candidate-pair loop; the candidate-pair `break` can no longer skip it | **CONFIRMED** | `git show 3c1ebff` + current source. The media-source capture is now a standalone `for (const stat of stats.values())` at `sfu-client.service.ts:340-349` and `break`s at `:347` — that `break` governs ONLY the media-source loop (its sole job is the first audio media-source = local mic source). The candidate-pair loop is a fully separate `for (const stat of stats.values())` at `:351-372` with its own `break` at `:370`. The two loops are textually disjoint, so the candidate-pair `break` provably cannot terminate the media-source scan. Capture is now order-independent across both loops. (Dev's variant uses `break`-on-first-audio-media-source rather than the review's `continue` sketch — functionally equivalent and equally order-safe, since each loop is dedicated to one stat type.) An explanatory comment at `:336-339` documents the iteration-order rationale. |
| 2 | Still EXACTLY ONE `pc.getStats()` inside `collectDiagnostics()`; no second getStats added by the fix | **CONFIRMED** | `grep -n "await pc.getStats()"` → only `:195` (in `collectConnectionQuality()`, a different method) and `:309` (inside `collectDiagnostics()`). The new media-source loop reuses the SAME already-fetched `stats` report (`:340 for (const stat of stats.values())`). No getStats added. |
| 3 | REVISE touched ONLY `sfu-client.service.ts`; mic-energy.ts / spec / room.page.ts / meeting-sessions.service.ts unchanged since `706813d` | **CONFIRMED** | `git show --name-only --format='' 3c1ebff` → `frontend/src/app/services/sfu-client.service.ts` (single file). `git diff 706813d 3c1ebff --name-only \| grep -iE 'spec\|mic-energy\|room.page\|meeting-sessions'` → NONE. The four other B1 files are byte-identical to `706813d`. |
| 4 | `changes.md` updated to reflect `3c1ebff` + the separated loop (introduced-then-fixed iteration-order note) | **CONFIRMED** | `changes.md:4` Commits line now lists `706813d` + `3c1ebff`; §2 (`:34-36`) describes the media-source capture "in its OWN dedicated `for (const stat of stats.values())` loop" and explains the REVISE-1 rationale; Commits table `:60-61` includes `3c1ebff`; `:63` notes `3c1ebff` staged ONLY sfu-client.service.ts; SC-I1 (`:101`) and the new Caveat (`:117`) both document the introduced-then-fixed iteration-order regression contained within the batch. |

All four confirm. The single Check-2 blocker is resolved; the fix is surgical and order-safe; no second getStats; scope held to one file; changes.md accurate.

**Re-Review Verdict: APPROVE** — Check 2 resolved, all 8 checks now PASS.

STATUS: DONE (APPROVE — Check 2 resolved, all 8 checks now pass)
