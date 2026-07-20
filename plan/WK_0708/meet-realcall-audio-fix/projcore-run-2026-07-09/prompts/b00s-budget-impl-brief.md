<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B00S-BUDGET: Acceptance-only call burn + single-path smoke log

Batch ID: B00S-BUDGET
Plan: plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09/plan.md + decisions/2026-07-09-north-structural-speech-device-plan.md
Branch: batch-01-diagnosis-2026-07-08 (stay on run branch; no new branch)
Requirements assigned: structural foundation (not an AC) — enforces north budget: 25 acceptance-class burns; sub-threshold joins logged not burned
North-star anchors: budget/exit (25×3–5min), structural B00S-BUDGET (acceptance-only)
Lifecycle: pre-live — Deferral policy: OFF. Read `~/.claude/JROM/style/deferral-policy.md`. Under OFF: no TODO/FIXME, no "follow-up PR," no dead-code shims, no @deprecated markers without a queue.md row in THIS run. Uncertainty = STATUS: NEEDS-INFO, not a defer.

Estimated duration: SHORT — 20min
(non-test should be SHORT/atomic per §1.4c; >30min non-test means this brief should have been split)

Effort tier (PROJCORE-PROPOSED — confirm or counter-propose at PROPOSED): medium
  Mode chord: /fast ON · codex effort medium · Claude thinking marker none
  Validator topology: 3-agent (validator=codex55 L1; fallback sonnet if codex weekly headroom <1%)
  Why: dual ledger pollution + call-driver always-burns; mechanism fix across ledger+driver+tests

Context (from context-handoff.md):
B04-real VERIFIED (T_gap=279ms). B00S-SPEECH/DEVICE/RELOAD VERIFIED. B00S-AC15-RESCOPE BLOCKED (.123 ops + defective test).
Live callBurn pollution: repo-root `ledger-state.json` callBurnCount=58; `e2e/ledger-state.json`=49; cap=25. Two files because initLedger(process.cwd()) vs ledgerBasePath diverge.
call-driver `joinDualBrowserCall` calls `incrementCallBurn()` on success AND on catch — every join burns, including short/smoke/fail.

Requirements section (verbatim from structural plan B00S-BUDGET):
"1. incrementCallBurn only when acceptanceAttempt: true AND duration ≥ ~180s (or explicit AC8-class flag).
2. logCall({ purpose, durationMs, device_mode, stimulus, burned: boolean }) for every browser+join.
3. Single ledger path (fix split root vs e2e cwd).
4. Fail-closed: acceptance path refuses if burned count > 25."

Observed (current state):
- `e2e/harness/call-ledger.ts`: `incrementCallBurn()` always increments; no acceptance gate; no logCall; no smoke log file.
- `e2e/harness/call-driver.ts` ~456 success path + ~475 catch path both call `incrementCallBurn()` unconditionally.
- Dual state files: `/home/agjrom/websites/meet-poc/ledger-state.json` and `.../e2e/ledger-state.json`.
- Tests in `e2e/harness/__tests__/call-ledger.test.ts` and `call-driver.test.ts` assert old always-burn semantics.
- Hard constraint: vitest `maxForks: 3` — never raise; run only targeted harness unit tests (no full browser suite).

Expected (acceptance criteria):
1. `logCall(...)` records every completed join attempt (success or fail) with purpose, durationMs, deviceMode, stimulus, burned boolean, timestamp — append-only JSONL (single path under ledger dir).
2. `incrementCallBurn` only when `(acceptanceAttempt === true || purpose marks AC8-class) AND durationMs >= 180_000` (or explicit `forceBurn: true` for documented AC8-class <180s edge — default OFF). Short smokes (<180s) log burned:false and do NOT increment.
3. Catch/fail path: logCall with burned:false unless acceptance criteria above met (harness abort of a long acceptance call may still burn per north "including harness-caused aborts" when acceptanceAttempt was true AND elapsed ≥180s; if elapsed <180s → log only).
4. Single ledger path: resolve ledger dir once (prefer `LEDGER_STATE_DIR` env, else fixed repo-root or e2e/ — pick ONE, document, migrate both existing files into that path without losing max(callBurnCount); do not invent a reset of the 25-cap counter in this batch — only stop further pollution; optional `reconcile` note in changes.md is fine, NO silent zeroing).
5. Fail-closed: if `isCallBurnExceeded()` (count > 25), `joinDualBrowserCall` with `acceptanceAttempt: true` must throw before launching browsers; non-acceptance (smoke) still allowed (logs only).
6. Unit tests updated (~1-3 focused): burn only on long acceptance; smoke no-burn; logCall lines written; single path; fail-closed gate. Run: `cd e2e && npx vitest run harness/__tests__/call-ledger.test.ts harness/__tests__/call-driver.test.ts` (or equivalent focused). DO NOT run `*.browser.test.ts` in this batch.
7. changes.md under run-dir `validation/b00s-budget-changes.md` (Codex-style: User Report, Root Cause, Code Changes).

Likely files:
- `e2e/harness/call-ledger.ts`
- `e2e/harness/call-driver.ts`
- `e2e/harness/__tests__/call-ledger.test.ts`
- `e2e/harness/__tests__/call-driver.test.ts`
- optionally `e2e/harness/index.ts` exports

Scope:
- Implement only B00S-BUDGET acceptance-only burn + smoke log + single ledger path.
- This is ONE atomic vertical slice: tight diff, ~1-3 focused unit tests. If PROPOSED is bigger, propose a split.
- Do not touch product frontend/backend, browser live AC tests, B00S-AC15-RESCOPE, or vitest maxForks.
- Do not reset callBurnCount to 0 (pollution evidence stays; mechanism fix is the deliverable).
- Surgical only. No "while I'm in here" scope creep.
- Robust polled assertions, not one-shot checks. Assert the OUTCOME, never just that an action fired.
- Escape valve: if dual-file migration is messy, pick e2e/ as canonical + make call-driver always pass absolute ledgerBasePath=repo-resolved path; document.

Plan handshake protocol (MANDATORY before implementation):
1. Read this brief in full. Read referenced files.
2. Reply with PROPOSED: mechanism-level diagnosis + planned files + risks + estimate confirmation.
3. Confirm or counter-propose the effort tier (one-line "why"). Higher wins on conflict.
4. End reply with: STATUS: PROPOSED — <one-line approach> · complexity: <confirmed-or-counter> · why: <one line>.
5. Wait for projcore APPROVED-PLAN before writing code.
6. If REVISE-PLAN returned, address gaps, re-emit STATUS: PROPOSED.

After APPROVED-PLAN:
7. Implement at the agreed mode chord.
8. Reply with STATUS: DONE — <one-line summary> when build + targeted tests green.

Required artifacts:
- validation/b00s-budget-changes.md (User Report verbatim + Root Cause mechanism + Code Changes per-file WHY)
- decisions/ only if non-trivial autonomous call (else state "Autonomous decisions: none")

Repo root: `/home/agjrom/websites/meet-poc`
Run dir: `/home/agjrom/websites/meet-poc/plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09`

---

## Streaming-order mandate (root cause of pre-v4 stalls — JROM 2026-06-06 panel-locked)

**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). Not the first sentence — the first TOOL CALL, BEFORE any prose tokens stream. This is a buffer-flush guarantee: if your session is interrupted between prose-streaming and the tool call, the callback never lands and projcore stalls. Append first, prose after.**

## Callback emission — the ONLY sanctioned form

Use the helper. Do not hand-write `>>` redirection — the helper validates role/state/note and locks atomically:

```
PROJCORE_CALLBACKS_FILE=<abs-path-to-callbacks.md> \
  ~/.claude/agents/lib/projcore-emit-status.sh <role> <batch-id> <STATE> "<note>"
```

The dispatch gateway pre-bakes `PROJCORE_CALLBACKS_FILE=<abs-path>` so you can copy the line verbatim.

The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)

```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO
validator states:   WORKING | REPRO-CONFIRMED | REPRO-FAILED | REPRO-CLEARED-ON-LOCAL | REPRO-STILL-PRESENT | BLOCKED | NEEDS-INFO

NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```

The helper REJECTS coordinator-only states and any unknown token. Use WORKING only for non-terminal progress (first reply if no routeable state yet, or any reply >2min since last callback). Emit terminal/handshake state directly when you have it.

## ACK stop-rule

Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+<your-role>[[:space:]]+<your-batch-id>[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — **STOP emitting callbacks for this batch.** Coordinator has received your state.

## Optional pane-STATUS echo (human-readable mirror only)

End your reply with `STATUS: <STATE> — <same short note>` for human/transcript readability. The pane STATUS is NOT in the detection path — projcore reads the callback file. If pane STATUS state ≠ callback STATE, callback wins (debug-logged, not surfaced to JROM).
