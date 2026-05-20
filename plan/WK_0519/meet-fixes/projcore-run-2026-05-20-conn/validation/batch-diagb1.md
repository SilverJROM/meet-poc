# Batch B1 (diagb1) — Projcore Independent Validation

**Verdict: PASS — VERIFIED (1 send-back iteration). DR-6/7/9/10 closed.**

## Independent execution

| Gate | Result |
|---|---|
| Commits | e92e514 (impl) + f53da9a (iter1 mic-meter fix) on fix/meet-conn-diag |
| `npm test -w backend` | **101 passed / 1 skipped** (+1 = signaling-knock-admit pending-list test) |
| diagb1 e2e | 5/5; spec has 18 real DOM assertions |
| Full Run-1 + diag1 + diagb1 | **74/74** PASS (R8.1 → 20 consecutive) — re-run by projcore after the iter1 fix |
| Screenshots | quick-join, empty-name-error reviewed (+ expanded, live-knocker on disk) |

## Send-back (iter 1)

First completion (e92e514) failed gate 4: Run-1 73/1 — `v2-b5-lobby/lobby-mic-meter.spec.ts` S5.2 wasn't updated for DR-6's collapsed device panel (codex updated the sibling specs but missed this one). Bounded correction sent (corrections/batch-diagb1-iter1.md); codex fixed it (1 file, 1 insertion) + swept v2-b5 (no other gaps) → 74/74. Role-boundary respected — codex fixed ONLY the listed gap.

## Evidence Quality Gate (§1.11)

- Q1 PASS: tests drive real lobby UI (quick-join render, expander, empty-name, after-join knock).
- Q2 PASS: DR-9 proven at the right level — e2e has host-already-in-call + second-client-knocks-later → list updates WITHOUT reload (the exact reported bug).
- Q3 PASS: screenshots show the real quick-join + empty-name-error pages.
- Q4 PASS: 5 scenarios ↔ 5 tests.
- Q5 PASS: each requirement observable.

## Existing-spec edits audit (honesty check)

Codex modified 5 existing specs (v2-b5-lobby, fixc2-device-modal, mb1, mb4, phase2-axes) — all legitimate adaptations to DR-6's collapsed device test (adding a "Test / configure devices" expander click before asserting on the device panel). The mb4 S3.4 rewrite reflects the mic-preview moving behind the expander; the FIXC2 device-dialog component itself is unchanged (still covers VU behavior). No weakened/deleted assertions to game the gate.

## Requirement closure

| Req | Status |
|---|---|
| DR-6 — Quick-join with self-preview (device-test opt-in) | **VERIFIED** — screenshot + e2e; FIXC2 dialog intact behind expander |
| DR-7 — Pre-join validation (empty-name + clear setup errors) | **VERIFIED** — inline error + focus + blocked Join; setup errors normalized |
| DR-9 — Live knocker updates (BUG) | **VERIFIED** — backend authoritative pending-list broadcast on every change; after-join-knock e2e passes without reload. Root cause was: snapshot only sent on owner-join, post-join knocks relied on one ephemeral event |
| DR-10 — Subtle doorbell on knock | **VERIFIED** — WebAudio chime, admitters-only, debounced, fires on NEW knocks only (not snapshot replay — projcore amendment held) |

## Remaining in conn-run

- Batch B2: DR-1 screen-share helper, DR-2 diagnostics panel + force-relay toggle, DR-3 WS-reconnect. (Dispatching next.)
- DR-8 cross-network: still needs JROM live re-test with TURN active.
