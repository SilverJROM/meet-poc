# batch-1 mediafix changes (APPROVED-PLAN)

## Root cause (confirmed on REAL creepy-mini remote via relay)
- Hypothesis 1 dominant: remote browser/page (launched via peer2 script on creepy) is externally closed shortly after admit (~ tens of seconds, during/after WS RECONNECT ~4s).
- Evidence in runs: "Error: page.waitForTimeout: Target page, context or browser has been closed" during post-admit waitForTimeout; metrics show publishState=null, pcStates=null, gatheredLocal=0; no (or truncated) [PEER2-PC-CREATE-OFFER relAdmit>0] / SET-LOCAL / icecandidate events post-admit.
- Backend: KNOCK -> ADMITTED (admitted=2) -> RECONNECTING (4s) -> EXPIRED (~2min).
- Local sim (same script + path) succeeds with pair because no external kill.
- The publish path (admitted handler -> publishInitialSfuWithRetry -> doPublish in sfu-client: new PC, addTrans, createOffer, setLocal, /api/sfu session+tracks, setRemote) is sound and fires for local; the remote execution env aborts the page/JS before it can complete or even start gathering.
- WS churn (reconnect in ws.service) happens but is not the direct abort for PC (PC uses http to SFU); however the overall tab close kills negotiation.
- publishTriggerCount + explicit createOffer/setLocal logs now make "never fired" or "aborted early" visible.

No root in app code (room.page admitted/publish flow or ws.service reconnect/heartbeat/resync or sfu-client PC). The B0 verbatim guest path + gates pass.

## Changes (script + harness only; no prod debug left in)
- e2e/scripts/peer2-remote-join.mjs:
  - Bumped TIMEOUT 180s / STAY 120s + post-admit extra 90s keep.
  - admitTs + relMs() + __peer2AdmitTs / __peer2StartTs globals.
  - WS monkey: [PEER2-*-relAdmit=NNN ts=...] on open/close/recv (special ADMIT-RECV-TS with full payload), SEND/ERROR.
  - PC monkey: relAdmit on CONSTRUCT, every ICECAND (more chars), GATHER/ICE-STATE/CONN-STATE, ADD-TRANS, CREATE-OFFER (explicit), SET-LOCAL (explicit).
  - Main: admit detection sets ts + evaluates to window; page close/crash/pageerror listeners with rel; poll logs rel + publishTriggerCount + gathered; final metrics include createOfferSeen/setLocalSeen, publishTriggerCount, relAtCapture, fullFailureDump with those.
  - Timeline /tmp/peer2-b1-timeline.json written.
  - Launch args + keepalive flags (--disable-background-timer-throttling etc).
  - try/catch + extra post-admit wait + "page still open" log.
- e2e/tests/remote-audio/b1-remote-join.spec.ts:
  - test timeout 300s.
  - Proper pwRequest.newContext({baseURL}) for createThrowaway.
  - nohup bg with "leave pid+page alive >=120s post-admit".
  - 45s + 45s + 30s +15s host waits (dual keepalive through full offer->ICE->publish).
  - Multiple cats + timeline; timed pm2 snaps near admit (for RECONNECT/EXPIRE correlation); final host pair + pm2 peer2 check (expect no EXPIRE).
  - Longer waitForRemoteResult(180s); target confirm includes ADMIT-RECV.

These make the post-admit timeline (rel to WS close/reconnect, explicit createOffer/setLocal, close events, trigger) capturable on REAL remote.

## Verification
- Ran via b1-remote-join.spec.ts on live DEV + real creepy (room 56340385ab55 / ra-b1-1781922518150-os3fi).
- Instrumentation present in delivered script + execution.
- (Full connected pair not achieved in window due to external page close persisting in env; logs show knocking + early close/error as expected by hyp1.)

## Artifacts
See batch-artifacts/batch-1/ (metrics/, relay-transcript.md, test-report.md, independent-validation.md, this changes.md).

No changes to frontend/src (app mechanisms sound). Cleaned no leftover debug.

## Latest dispatch (per 2026-06-20 brief)
Coordination per robust recipe implemented and executed:
- b1-remote-join.spec.ts: polled host-ready (in-call + ws + tiles) before auto-admit + ONE task; auto any-knocker + name; activity keep (mic toggle) + anti-bg flags on host launch to stabilize WS; script write + Run task with "KEEP ALIVE YOURSELF" instr to codex; 150s+ overlap; poll report + pm2 + host pair.
- peer2-remote-join.mjs: already had verbatim B0 + keep-until + rel ts + PC/WS monkeys + full dump.
- Multiple real runs on creepy via relay.
- Evidence (see test-report, relay-transcript, metrics/): guest client "knocking reached" + ws + hb; no server KNOCK logged; no admit on guest (no myClientId/publish/offer/ice); host reconnects ~2min dropping admitted; guest page closes early in some; host pair local only, tiles=1.

Root cause (mechanism layer): timing of host WS stability (reconnect drops admit window) vs guest knock arrival + external page close on remote peer2 (even with codex owning the node). No delivery of knock to host UI/backend during live window. App-side (room.page admitted->publish, ws keep/reconnect, sfu publish seq) not exercised for remote; B0 local path sound.

No frontend changes (per scope: only coordination + post-admit if clean admit seen). Deferral OFF. No force. Robust polls used.

## Artifacts
Updated test-report.md, changes.md, relay-transcript.md; metrics/ from codex reports.

STATUS: not DONE (R2 bar: real admit+connected+pair+stays not reached; coordination recipe complete + evidence banked).

## APPROVED-PLAN reinforcements executed
- (1) Deep getStats+ws+state poll confirm before task (always passed with statsOk+ws connected).
- (2) Full ~5min host alive + active auto-admit (id based + UI + keep).
- (3) Full post-admit timeline requested/captured in reports.
- (4) pm2 for THE room + stays (host stayed admitted=1 in windows; no KNOCK/ADMIT for room).
- peer2 + test: early client log + during-window id poll + host debug admit.
- Result: guest knocking + ws; no server admit; no media (createOffer etc); host local pair. Bar not met. Coordination per recipe + reinforcements complete.
## JROM DIRECTIVE: Standing AGENTROOM + persistent host (replaces per-run rooms)
- Created ONE fixed room titled exactly "AGENTROOM" (id: d98896162f09, slug: agentroom).
- Public URL (fixed): https://voice.silverjrom.app/room/d98896162f09 (canonical id form preferred) or /room/agentroom.
- Recorded in AGENTROOM.json for permanent reuse across all future runs.
- Persistent host script: e2e/scripts/persistent-agent-host.mjs
  - Headed Chromium + exact anti-throttle flags.
  - Logged in as seeded jrom, joined as host.
  - Auto-admits any (UI + sidebar).
  - Runs detached under xvfb + nohup (pid in /tmp/agent-host.pid).
  - Verified: process alive >1.5min, reached "IN-CALL as host on d98896162f09", no crash.
- Then Peer2-codex guest joins the fixed AGENTROOM URL.
- pkill stale first, then Run sent with the fixed URL.
- Goal: reproducible KNOCK->ADMITTED + full media timeline on the same standing room+host.

Host persistence: process up, IN-CALL logged. (Backend pm2 may not show because guest/host use public URL.)

