# Validation — batch-B5 (Recording reliability) — VERDICT: PASS

Date: 2026-06-23. Coordinator independent gate (verifier ≠ fixer). Implementer: Sonnet. Validator: codex55.

## §1.10 7-gate
1. **Artifacts** ✅ — batch-B5/{scenarios,changes,review,test-report,independent-validation}.md + screenshots/ + 2 decisions/ entries.
2. **Diff review** ✅ — independently verified the mechanism:
   - T1: `withTimeout(upload, 300_000, null)` (5-min cap); 8s kept only on `recorder.stop()`. (room.page.ts:1435,1580)
   - T2: `close-room` sent ONLY after `allSettled([upload, uploadPerUser])` awaited (room.page.ts:1579-1597) — fixes open-session race.
   - T3: per-user awaited (1443, 1581).
   - T4: `keepalive:true` ONLY on `uploadMetadata()` (recorder.service.ts:469); NOT on `/upload` (248) or `uploadPerUser` (519) — codex55's mandatory correction applied.
   - T5: beforeunload guard on `isUploading()` (3168).
   - T6: on upload fail → `recordCallIssue(...)` + dialog reopen (1602-1607).
   - T7: localStorage `recording-pending-<sessionId>` set on start, cleared only on success (1586); rooms-page banner.
3. **Build** ✅ — `tsc --noEmit` exit 0; implementer `npm run build` green (3.8s).
4. **Targeted test** ✅ — `e2e/tests/b5-recording/record-host-leave-upload.spec.ts`: baseline HEAD FAILS (no file), fixed worktree PASSES (file saved + visible in Library). (§1.21 REPRO-CONFIRMED + REPRO-CLEARED-ON-LOCAL)
5. **Evidence quality (Q0-Q7)** ✅ — Q0: R5.1-R5.7 each mapped to an assertion. Q2 UI-PROOF: e2e asserts rendered DOM (Library row visible + Download href), not API-only. Q6: asserts OUTCOME (file saved/visible), not attempt. Q7: no TODO/FIXME/deferral in diff.
6. **Req coverage** ✅ — see matrix R5.1-R5.7.
7. **Standing rules** ✅ — decisions/ entries present; no git commit (JROM rule).

## High-prio adversarial check (B5 = data loss)
The §1.21 reproduce-gated regression test is gold-standard adversarial evidence (provably fails on broken code,
passes on fix). Coordinator additionally self-red-teamed the highest-risk edge case — a FAILED upload under
`Promise.allSettled` (which does not reject): verified the fix sets `uploadFailed`, does NOT clear the
reconciliation flag, fires the T6 host notice, and reopens the dialog → no silent loss. PASS.
**Decision:** full multi-agent red-team panel deferred (repro-gated regression test + edge-case verification
suffice; Claude bucket at 22% headroom). Logged.

## Notes
- R5.7 international-leg confirmation folds into the run-level Peer2-machine e2e capstone (per north-star mandate).
- Phase 2 (chunked-during-call durability) remains a scheduled follow-on (B5b) — correctly NOT built here.
