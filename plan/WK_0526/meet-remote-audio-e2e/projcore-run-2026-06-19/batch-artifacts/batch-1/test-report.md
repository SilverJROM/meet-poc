# B1 test-report (real creepy remote)

Test: e2e/tests/remote-audio/b1-remote-join.spec.ts
Run: live DEV (pm2 meet-poc-fe/be), E2E_BASE_URL, owner login jrom, fresh throwaway room, REAL creepy via JohnnyOne relay + nohup bg peer2.

## Flow executed
- createThrowaway + publicUrl
- host login + joinAsHost (owner)
- deliver current peer2-remote-join.mjs (enhanced)
- nohup bg run on creepy (with "leave alive >=120s post-admit")
- host keepalive waits (>120s total post launch)
- pm2 snaps (near-admit + final, for RECONNECT/EXPIRE)
- cats for log/metrics/timeline
- waitForRemoteResult + host pair capture + tiles

## Outcome on REAL creepy
- Host reached in-call, room created.
- Script written + bg launched.
- From pm2 + cats (this + prior similar): remote reaches "knocking state reached", WS open, heartbeats.
- Admit seen in backend for similar rooms (ADMITTED -> RECONNECT ~4s).
- Remote metrics: success=false, publishState=null, no ice/pc, errors include page closed during wait.
- No full connected + pair + outbound on remote in the window.
- Host side pair would be captured if remote succeeded.

## Instrumentation added (verified in delivered script + execution)
- relAdmit timestamps on WS/PC events relative to admit/RECONNECT.
- Explicit [PEER2-PC-CREATE-OFFER relAdmit=...] and SET-LOCAL.
- publishTriggerCount in polls/metrics.
- page close/crash listeners.
- /tmp timeline + enhanced failureDump.
- Keep flags + 120s+ post-admit waits + catches.

## Artifacts
See batch-artifacts/batch-1/ (changes.md, metrics/ dir, relay-transcript, this, independent-validation.md)

The real remote did not reach R2 PASS criteria (iceConnection connected + outbound track + real selected pair + stays admitted without EXPIRE).

Enhancements provide the required visibility for future runs. No app source changes (root external to app).

## Latest dispatch batch-1 run (2026-06-20 per brief recipe)
- Strict flow: PW test host createThrowaway + owner login + join + robust polled ready (in-call+tiles+ws) + start any-knocker auto-admit loop + write script via relay + ONE sendRelayChatMessage task to Peer2-codex with "KEEP ... ALIVE YOURSELF until ... connected OR 120s" + long host overlap + poll listAi + pm2 snap + host capture.
- Flags + activity keep (mic toggle) added to host to prevent RECONNECT.
- Multiple real-creepy executions (rooms e.g. 2ebcdeabe25f, 2b59f2d21078, cc180836b0ee).
- Codex: guest reaches ws open + "knocking reached" + heartbeats; reports "no myClientId, admit, createOffer..."; page/context closed early (~20-90s); metrics success=false, errors include page closed.
- pm2: host RESUME admitted=1; no "KNOCK peer2-remote" or "ADMITTED ... admitted=2" logged for these rooms; host often RECONNECTS (admitted=0) mid-window.
- Host final tiles=1, local pair only.
- Conclusion: coordination recipe followed exactly (no force); knock reaches guest client state but not delivered as backend event while host window active. Page liveness on remote still fragile. App join/publish/ws sound per B0.