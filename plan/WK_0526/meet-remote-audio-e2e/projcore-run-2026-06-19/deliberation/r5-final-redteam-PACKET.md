# RED-TEAM PACKET — R5 four-way remote audio + re-subscribe app fix (2026-06-20)

You are an adversarial reviewer. Goal: find any reason this is a FALSE PASS or the fix is unsound for a REAL human call. Reply PASS or FAIL + findings. Be skeptical.

## The app fix (deployed v2, main-253BGJEF.js)
Bug: 4-party SFU call — when a publisher reconnects/republishes (new cfSessionId/trackName), existing subscribers stayed bound to the DEAD old track epoch (0 bytes) = silent for that speaker on real reconnect/device-switch.
Root cause: production subscribe is an async Angular effect (room.page.ts:736-745); on new-cfSession reconnect, handleSfuPresence evicted state but did NOT directly re-subscribe — relied on the async effect (race) + a stale in-flight doSubscribe could bind a dead track.
Fix: (1) handleSfuPresence reconnect branch directly calls subscribeIfNeeded(nowPublisher); (2) doSubscribeTracks stale-cfSession guard returns-without-binding if publisher reconnected mid-POST — incl publisher-left (codex55 FAIL→fixed: `if(!publisherCurrent || cfSession mismatch) return`); tests SFU-R3/R4/R5 pass.

## The measured proof (raw, this run 20:39 — verified by projcore, not grok's summary)
4 parties: host=440, agent(creepy-mini Peer2-codex)=660, local1=940, local2=1100. SFU = Cloudflare Calls.
- HOST-MEASURES-ALL matrixOk:true → attributes {660:pass:20250b, 940:pass:18124b, 1100:pass:81567b} (NOT its own 440)
- LOCAL1-MEAS-ALL matrixOk:true → {440:81567b, 660:20250b, 1100:18124b} (NOT its own 940)
- LOCAL2-MEAS-ALL matrixOk:true → {440:81567b, 940:18124b, 660:20250b} (NOT its own 1100)
Each pass = WebAudio energy>=3s AND inbound-rtp bytesDelta>0 AND FFT tone within tolerance. Self-exclusion = deterministic own-tone filter (smoke-tested to reject false positives). agent-660 heard by ALL 3 with consistent real bytes (20250).
Barrier gate (pre-measure): each receiver confirmed all 3 peers bytesDelta>0, stable cids >=10s, before measuring.

## Known gaps (assess if they invalidate R5)
1. Agent RECEIVE side (agent hears host/local1/local2) NOT in THIS clean window (bar-agent.json best-effort, empty). Agent-as-SENDER proven to all 3 here; agent-as-RECEIVER proven in PRIOR runs (agent attributed local1-940+local2-1100 pass; host->agent was the pair the re-subscribe fix repaired).
2. bytesDelta for the 1100 track aliases other tracks' values across receivers (host sees 1100=81567, l1 sees 1100=18124) though all >0 — possible residual per-track mapping imperfection (tones+energy+matrixOk still correct).

## QUESTION
Is the 4-way remote audio (everyone hears everyone, incl the remote agent) genuinely PROVEN for a real call, and is the re-subscribe fix sound? Or is this a false pass? PASS/FAIL + specific findings.
