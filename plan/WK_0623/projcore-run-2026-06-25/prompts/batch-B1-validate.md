# B1 validation — recording saves through close-room on the DEPLOYED env (sonnet, VALIDATOR)

**Role:** Independent VALIDATOR (verifier ≠ fixer — do NOT edit code). **Repo:** ~/websites/meet-poc. You validate as the USER would, on the **rendered app on the deployed env** (UI-proof, §1.11). The implementer just rebuilt+deployed the frontend so the `flushRecordingForExit` (upload-before-close) fix is now live.

## What to prove (R1, deploy half)
On the **served app** (`http://localhost:4700`, the same bundle behind voice.silverjrom.app), a host can record a call and the recording is **SAVED when the host ends via Close room** — the behavior that was broken (the real HRIS_TOJ call lost its recording on the stale build).

## §1.4h reproduce-first
The broken baseline is already documented (the real HRIS incident: zero `[rec] saved`, recording lost on close). Your job is the **fixed-confirmation on the deployed env**: drive a host recording that ends via Close room and prove `[rec] saved` now fires + the file appears.

## How (use the existing harness — do not write app code)
- There is a host recorder harness `e2e/scripts/capstone-record-host.mjs` (logs in as owner, joins, More→Record, ends WHILE recording via Leave→Close room). Use it (or adapt invocation) against the deployed app. Pick a SHORT record window (e.g. `--record-ms 30000`) for this deploy-smoke — the long-call race is the separate B5 capstone.
- Watch the backend log for the save: `grep '\[rec\] saved' logs/meet-poc-be-out.log | tail` AFTER the run — a new line stamped today, for the harness room, is the proof.
- Confirm the file exists in `./recordings/` (new, today's timestamp) and/or appears on the `/app/recordings` page.

## Acceptance
- PASS = a recording started in-call, host ended via **Close room**, and `[rec] saved` fired for that session with a real file on disk (UI/library proof). The pre-fix behavior (lost on close) is now closed.
- If it does NOT save → this is a real FAIL; capture the backend log + any console error and report exactly what happened (do not fix it — report).
- Clean up any room/recording your test created if it's throwaway; never touch TEST_ROOM01 (`testroom01001`).

## Deliverable
`validation/B1-validate.md`: the harness invocation, the `[rec] saved` log line (or its absence), the saved file path, and verdict. End with `STATUS: VALIDATED` (saved through close-room) or `STATUS: REJECTED <what broke>`.

## Callback contract (MANDATORY)
FIRST action in your reply (before prose): append `[callback] B1V sonnet <STATE> <timestamp>` to `plan/WK_0623/projcore-run-2026-06-25/callbacks/B1V.md` (STATE = VALIDATED or REJECTED). Then run the validation.
