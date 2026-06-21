BATCH 1 — ARCH-0: unified + serialized media engine (KEYSTONE). PLAN HANDSHAKE FIRST (no code until APPROVED-PLAN).

Context: investigation locked (findings.md ~63 items; og-requirements.md FINAL contract). North star: UNIVERSAL like Zoom/Meet — any mic+speaker+browser device gets two-way audio; camera optional. We build ONE batch at a time, agree, implement, validate, then next.

This batch = ARCH-0 ONLY: the single module that owns capture acquire/replace + the deviceId fallback ladder + a single-flight serialized acquisition queue (META1), that lobby AND in-call will both route through. Do NOT yet rewire every call site — this batch delivers the engine + ITS unit-tested pure logic + wires ONE path (lobby preflight) through it as the demonstrable vertical slice. Remaining call sites get routed in subsequent P0 batches.

PROPOSE (reply PROPOSED, then WAIT):
1. Module shape + API: e.g. acquireAudio(opts) / acquireVideo(opts) with the fallback ladder (selected {exact} → {ideal} → default → (video) graceful-none), acquire-before-destroy, single-flight queue serializing all getUserMedia, and a pure decision fn resolveConstraints/resolveNextOnError that is UNIT-TESTABLE without a browser.
2. The atomic slice for THIS batch (<30min, ~1-3 tests, tight diff). If ARCH-0 is too big for one atomic batch, PROPOSE the split (e.g. 1a = pure fallback-decision + queue logic + unit specs; 1b = the acquire wrapper + wire lobby preflight). Smaller is fine.
3. The unit tests that PROVE it (node:assert via npx tsx — fake-media e2e CANNOT prove acquisition, so test the PURE decision fn: exact-fails→ideal, ideal-fails→default, video-none-on-fail, queue serializes concurrent calls).
4. Files touched, risks, no-regression note (must not break current lobby/in-call yet).
5. complexity tier + why.

End: STATUS: PROPOSED — <one-line> · complexity: <tier>. WAIT for APPROVED-PLAN. Do NOT write code first.
FIRST append plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04/callbacks.md: [projcore callback] ARCH0 PROPOSED <one-line> (when you reply).
