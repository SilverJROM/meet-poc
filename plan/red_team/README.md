# Multi-Model Red-Team Playbook (projcore-ready)

A reusable methodology for finding the TRUE root cause of a hard bug and shipping a fix that actually
holds — distilled from the meet-poc "host can't hear remote audio on an international call" run
(2026-06-08). Designed to be lifted into projcore as a sidecar (`projcore-redteam.md`) and applied to
any project.

**The thesis (why this exists):** a prior fix for this exact bug (FIX1–FIX5) *passed review and shipped,
and still failed live.* Prose/design review is not enough. The highest-value gate is an adversarial,
multi-angle red-team of the **implemented code**, run until it converges.

---

## 0. When to use this
- A recurring, user-blocking bug that a previous "fix" did NOT actually fix.
- Hard-to-reproduce / real-device / heisenbug-class failures where tests can pass while the app fails.
- Any change where "looks correct" is not good enough and you need defense-in-depth confidence.

Overkill for trivial/mechanical changes. This burns many model-turns; use it where correctness dominates cost.

---

## 1. The two phases (keep them separate)

**Phase A — DESIGN deliberation** (find the root cause + converge on the fix approach), and
**Phase B — CODE red-team** (adversarially break the *implemented diff* until it converges).

The critical insight from this run: **design review and code review catch different bugs.** 7 rounds of
design deliberation produced a unanimous, well-evidenced fix — and the *first* code-red-team round still
found a P0 the design rounds never saw (a silent-failure path in the actual watchdog code). Do BOTH.

Relocating the convergence gate from prose to code is an operator decision (log it): once design findings
degrade to doc-precision (severity monotonically decreasing, last round no new failure mode = "design
convergence"), stop polishing prose and put the rigorous gate on the code.

---

## 2. The panel: diversity over raw strength

Six independent models, each in its own tmux session:

| Role | Runtime | Why |
|------|---------|-----|
| opus (coordinator, inline) | claude opus | synthesizes + writes its OWN verdict each round (first-class panelist, not a referee) |
| codex55 | `codex` gpt-5.5 | frontier reasoning |
| gpt54 | `codex -m gpt-5.4` | different frontier lineage |
| spark | `codex -m gpt-5.3-codex-spark` | cheap, fast, *different blind spots* |
| sonnet | `claude --model sonnet` | strong code reader |
| haiku | `claude --model haiku` | cheapest; **additive angle** |

**Proven in this run:** the "weak" models earned their seats. *Spark* found the fix was unreachable behind
a hardcoded flag (B11). *Haiku* found the late-joiner-silence bug (B12). Neither was found by the frontier
models. **Model diversity catches what model strength alone misses.** Haiku-as-auditor is fine even where
"never Haiku for production" applies — it's an extra voice, not the implementer.

**The coordinator can be wrong.** Opus voted CLEAN in two code-red-team rounds where the panel found real
bugs (a stuck-latch, a map leak). Never trust a single reviewer — even the strongest. The panel is the
safety; the coordinator is one vote.

---

## 3. The 3-consecutive-clean gate (the stopping rule)

Keep red-teaming until **3 rounds in a row find nothing new.** ANY bug resets the streak to 0.
Cap the total rounds (e.g. 30) as a backstop. Operator-tunable.

This forces the fix to survive repeated adversarial passes, not just one "looks good."

### 3a. Rotating lenses (the rule that makes the streak honest)
**Each consecutive round MUST attack a DISTINCT surface. A round counts toward the streak ONLY if it used a
NEW angle AND found nothing.** Three clean = three *different* break-attempts came up empty — never the same
shallow check repeated. If a round reuses a prior lens, it does not count.

**Why it matters (proven):** after 3 clean-ish structural rounds, switching to a *concurrency/leak/scenario*
lens (L4) immediately found a HIGH severity selected-device-fallback bug + an unbounded-map leak that the
structural lenses had walked right past.

**Lens catalog (assign a fresh one per round; extend as needed):**
- **L1 — Structural / correctness:** does each changed line do what the requirement asks? Dead code, dangling refs, wrong-level proof.
- **L2 — Fix-verification + false-positive / silence edges:** does the fix actually close the bug? Can a new guard mis-fire on a benign case?
- **L3 — Re-verify after a fix round + remaining structural.**
- **L4 — Concurrency / async races + memory & listener leaks + real-world scenario traces** (walk the exact user failure end-to-end through the code).
- **L5 — Adversarial / garbage inputs + browser/platform quirks** (iOS Safari, Firefox-no-setSinkId, NaN/negative/huge stat values, autoplay variants) + error-path coverage.
- **L6 — Spec-vs-code divergence + observability:** trace each requirement → code → test; would the diagnostics let you debug the NEXT failure?
- **L7+ — State-machine exhaustiveness · payload privacy/security · performance under N entities · teardown/lifecycle hygiene.**

---

## 4. Verifier ≠ fixer (non-negotiable)

- The red-team panel and the coordinator NEVER write the production fix. A separate implementer does.
- The coordinator INDEPENDENTLY re-runs the gates (typecheck / targeted specs / build) — does not trust the
  implementer's self-"DONE". **This caught a premature DONE in this run:** specs passed under the loose `tsx`
  runner but the strict `tsc --noEmit` failed. Always run the *strict* gate yourself.
- Findings are sent back as a precise, numbered bug list (file:line + what-breaks + concrete fix). The
  implementer does a PROPOSED→APPROVED handshake, implements, the coordinator re-validates, then the panel
  re-red-teams with a NEW lens.

---

## 5. The loop (one full cycle)

```
DESIGN deliberation (Phase A) ──► converges to a fix design (v2.2, N numbered fixes)
        │
        ▼
implement the design  ── verifier≠fixer ──►  coordinator re-runs tsc/specs/build + reads the diff
        │
        ▼
CODE RED-TEAM round CRk  (assign lens Lk)
        │  6 models read the REAL code + diff, each writes <role>-coderedteam-CRk.md, STATUS: CLEAN|BUGS
        ▼
   any BUGS? ──yes──► synthesize precise bug list ──► CR-fix-k batch (PROPOSED→APPROVED→impl)
        │                                                   │
        │                                            coordinator re-validates (strict gates)
        │                                                   │
        └─────────────◄── streak=0; next round CR(k+1), NEW lens ◄┘
        │
       no (CLEAN) ──► streak += 1
        │
   streak == 3 (over 3 DIFFERENT lenses)? ──no──► next round, NEW lens
        │
       yes ──► commit ──► live/real-device validation ──► done
```

---

## 6. Mechanics (how it's actually run)

- **One model = one dedicated tmux session.** Panel sessions are separate from the implementer session
  (role separation). `/clear` panels between rounds so each round reads the code fresh (no accumulated bias).
- **Lean per-round packet** (`code-redteam-packet-CRk.md`): the lens for this round, what changed since the
  last fix, pointers to the REAL files + the unified diff, the requirement bar, and the exact output contract
  (`<role>-coderedteam-CRk.md` ending in `STATUS: CLEAN` or `STATUS: BUGS — <worst>`). Keep it small — a
  bloated packet handicaps the cheaper models = cheating the panel.
- **Dispatch:** 3-call tmux protocol (send text → send Enter → capture-verify the model is processing).
- **Tight watchers:** a background poll (6–15s) on the verdict files + pane-idle detection, so a
  finished-but-didn't-write model is caught fast (don't block on a model that's already done).
- **Evidence discipline:** every finding cites `file:line`; distinguish *proven* from *hypothesis*; a clean
  round must genuinely try to break it (no rubber-stamps). The coordinator writes its own verdict too.
- **Synthesis:** the coordinator dedups findings across the 6, ranks by severity, and turns them into the
  next fix batch. Track a streak table in `progress.md`.

---

## 7. What this run actually caught (case studies — why each layer mattered)

- **Design deliberation (Phase A)** nailed the root cause (selected-device sink-routing + orphaned Web-Audio
  graph) and a robust fix (per-publisher direct `<audio>` elements). The "weak" models found the two most
  load-bearing constraints (B11 unreachable flag, B12 late-joiner silence).
- **CR1 (L1 structural)** — found a **P0 the 7 design rounds missed**: a silent-no-banner path still in the
  watchdog code (play() resolves, element unpaused, sink emits nothing → no banner, silent). *Code review
  beats design review.*
- **CR2 (L2 fix-verification)** — found **edge-cases in CR1's own fix** (the new banner-latch could stick
  forever / false-fire on a silent participant). *Fixes need re-red-teaming.*
- **CR3 (L3)** — first clean round.
- **CR4 (L4 concurrency/leak/scenario)** — the NEW lens immediately found a **HIGH** (selected-device failure
  silently reported as success after default fallback) + an **unbounded map leak**, both invisible to the
  structural lenses. *Rotating lenses are essential.*
- **Throughout** — the coordinator (opus) was wrong twice (CLEAN when bugs existed); the panel covered it.
  Verifier≠fixer caught a premature DONE (tsx-pass / tsc-fail).

**The meta-lesson:** no single layer is sufficient. Design review, code review, fix-re-review, and rotating
adversarial lenses each catch a different class. Run all of them, to convergence.

---

## 8. Codifying into projcore (suggested)

- Add a `projcore-redteam.md` sidecar = §1–6 above.
- Trigger: a `[REDTEAM]` tag, or auto-trigger on "recurring bug a prior fix didn't close" / hardened-module /
  data-safety changes.
- Reuse the existing panel-session spawn + watcher + callback rails from `projcore-deliberation.md`.
- The streak table + lens assignment live in `progress.md`; packets + verdicts under
  `<run-dir>/deliberation/<topic>/code-redteam-packet-CRk.md` + `<role>-coderedteam-CRk.md`.
- Keep the operator levers: panel roster (which models), round cap, and the design→code gate-relocation
  decision (log it as an operator override when design has converged).

*Slow is fast: the planning/red-team leverage is greater than implementation leverage. A fix that survives
3 different adversarial lenses is worth far more than one that "passed review."*
