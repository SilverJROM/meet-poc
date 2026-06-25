# B5 — Capstone: real long call via Peer2's machine, recording saves through close-room (sonnet, VALIDATOR)

**Role:** VALIDATOR running the final real-call acceptance (verifier ≠ fixer — do NOT edit app code). This is the definitive proof per JROM's real-call rule: a **long** recording must SAVE when the host ends via Close room — the exact case the stale build lost (HRIS_TOJ, ~80 min).

## Setup facts
- App is deployed and live (B1) at `http://localhost:4700` (= voice.silverjrom.app via tunnel). Backend logs to `logs/meet-poc-be-out.log`.
- Peer2's machine `creepy-mini` is ONLINE. Drive it via the JohnnyOne relay: `e2e/scripts/relay.sh` (verbs: `send <msg>` / `poll` / `last` / `node`). Session is the live Peer2-codex session (default in the script; do NOT echo any key).
- Host harness: `e2e/scripts/capstone-record-host.mjs` (owner login, join AGENTROOM, More→Record, end WHILE recording via Leave→Close room, waits for upload). It accepts `--record-ms`.

## What to do
1. **Host a recorded call.** Use AGENTROOM (`d98896162f09`, owner `jrom@silverjrom.app`) — the harness already targets it. Pick a genuinely LONG-ish record window to exercise the race that the short test does not — at least **--record-ms 240000 (4 min)**; longer is better if practical.
2. **Bring Peer2 in as the remote talker.** Via `relay.sh send`, instruct Peer2-codex to open the AGENTROOM room link (`http://localhost:4700/room/d98896162f09` — confirm the reachable URL; if the tunnel host is needed, use voice.silverjrom.app/room/d98896162f09) and play/talk audio for the duration. Poll for its acknowledgement. (On-machine agent = collaborator: ask it to confirm it joined + is publishing.)
3. **End the call WHILE recording** via the harness (Leave→Close room) — exercising flushRecordingForExit + the B2 grace-window.
4. **Prove it saved (UI-proof):** a NEW `[rec] saved` line in `logs/meet-poc-be-out.log` stamped today for this session, the file on disk in `./recordings/` with a real (non-trivial) byte size, AND visible on `/app/recordings`. For a multi-min call the main mix should be clearly larger than the 30s smoke test.
5. Confirm the recording is NOT lost despite ending via Close room (the regression that started this).

## Acceptance / failure
- PASS = long recording, ended via Close room, `[rec] saved` fired + real file + library entry. This closes R1/R5 on a real call.
- If it does NOT save → real FAIL: capture the backend log (look for `[rec] rejected …` from B3 — it should now tell us WHY), console, and report exactly. Do not fix — report.
- Clean up: AGENTROOM is a fixed room — do NOT delete it; only remove throwaway artifacts. Never touch TEST_ROOM01 (`testroom01001`). When done, tell Peer2-codex via relay it can stop/leave.

## Deliverable
`validation/B5-capstone.md`: record window, Peer2 join confirmation, the `[rec] saved` line(s) + file sizes, library proof, verdict. End `STATUS: VALIDATED` or `STATUS: REJECTED <what broke + the [rec] rejected reason if any>`.

## Callback (MANDATORY)
FIRST action (before prose): append `[callback] B5 sonnet <STATE> <timestamp>` to `callbacks/B5.md`. End reply with the STATUS line.
