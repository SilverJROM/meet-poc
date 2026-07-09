# Co-planner JIT design consult — B08S-2 receive-side capture hook

**Role:** co-planner A (opus) + B (codex55). Design only. Do NOT implement product code.
**Run:** projcore-run-2026-07-09
**Callback:** append to callbacks.md:
`[projcore callback] coplanner <A|B> B08S-2 STATUS: WORKING|DONE|BLOCKED — <note>`

## Why escalated (north §1.16 ladder)

B08S-2 exceeded implementer send-back cap (haiku r2–r6). This is a **design** defect, not more code thrash.
Validator rule **stands**: synthetic capture as success evidence = FAIL. INVALID ≠ PASS.

## Question (answer both; converge)

**Where must the receive-side capture hook be installed so it deterministically captures:**
1. remote audio tracks that **already exist at join**, AND
2. tracks added by **later renegotiation**

**Options to evaluate (pick one primary + justify; reject the others with reasons):**
- A) `page.addInitScript` RTCPeerConnection constructor shim **before** navigation/join
- B) App/SfuClient **PC registry / ontrack** surface (e.g. `window.__meetDebug`, sfu-client singleton)
- C) Late constructor shim only (current broken path variants)
- D) Hybrid (specify exact sequencing)

**Also decide:** how is **'no capture'** distinguished from **'captured silence'** fail-closed?
- No capture → must not produce a success WAV (throw / INVALID / missing path)
- Captured silence → real zero/near-zero samples from a real remote track (valid evidence of silence, not false-green)

## Failure history (r2–r6) — attach as evidence

| Round | Commit | codex55 finding |
|---|---|---|
| r1 | 5d7f652 | Synthetic `generateStubAudio()` always written → false-green |
| r2 | cc07c56 | Fail-closed OK; TS1209 `new AudioContext?.()`; live branch invalid |
| r3 | 5d16e08 | getReceivers only on wrapper-created PCs; install after join → existing PCs invisible |
| r4 | 32a1951 | Install before join textually, but `page.evaluate` wiped by `page.goto` |
| r5 | 14b2f96 | addInitScript navigation OK; vitest ENOENT TEMP_DIR; possible stale `__captureHookState` snapshot |
| r6 | 735aad7 (pending final gate) | Haiku claim: temp dir isolation + state update — **do not re-gate until design locked** |

Read also if needed:
- `validation/b08s2-validation.md` … `b08s2-validation-r5.md`
- `e2e/harness/receive-side-recorder.ts`, `call-driver.ts`
- `frontend/.../room.page.ts` `__meetDebug` / `sfuGetStats`
- plan.md B08S-2 row + D29

## Deliverable

Write **one** converged decision file:
`decisions/2026-07-09-b08s2-receive-capture-hook-design.md`

Must include:
1. Chosen placement (A/B/C/D) + sequencing diagram in prose
2. Renegotiation handling
3. no-capture vs captured-silence contract
4. Minimal implementation contract for next impl batch (files, hooks, tests, acceptance)
5. Explicit "do not" list (synthetic success WAV, late evaluate-only wrap, etc.)

Both co-planners: read, deliberate (append notes if disagreement), then converge. Callback DONE when decision file is written and both agree (or document residual disagreement with recommendation).

**Conserve:** design docs only. No implementation.
