# RED-TEAM ROUND 2 — R5 full mesh, agent-receive NOW captured (2026-06-20 ~21:22)

Round-1 verdict was majority FAIL for ONE main reason: agent-RECEIVE side absent. That gap is now CLOSED. Re-assess.

## Complete 12/12 evidence (all 4 receivers, raw, projcore-verified)
Consistent clientIds across ALL receivers (proves ONE stable 4-party session): 502ab9f0=host(440), 81f94d99=agent(660), f1d561c6=local1(940), 15e58d50=local2(1100).

- HOST-MEASURES-ALL matrixOk:true → {940:pass, 1100:pass, 660:pass} (hears local1+local2+agent; NOT own 440)
- LOCAL1-MEAS-ALL  matrixOk:true (ISO-ts 21:21:09) → {1100, 440, 660} (hears local2+host+agent; NOT own 940)
- LOCAL2-MEAS-ALL  matrixOk:true (ISO-ts 21:21:09) → {940, 440, 660} (hears local1+host+agent; NOT own 1100)
- AGENT-MEAS-ALL (Peer2-codex native log via relay) matrixOk:true → expectedTones[440,940,1100], {940:pass,1100:pass,440:pass} (agent hears host+local1+local2)

Each pass = WebAudio energy>=3s + FFT tone-in-tolerance + inbound-rtp bytesDelta>0. Self-tone excluded (deterministic filter). Each receiver's barrier confirmed all 3 peers bytes-flowing + stable cids >=10s before measuring.

## Addressed from round 1
- AGENT RECEIVE: now PRESENT + matrixOk:true (the round-1 FAIL reason — closed).
- bytesDelta aliasing: fixed (byId/trackId fallback removed + track-id dedup); L2 deltas all distinct (4409/4706/4860); some small-value coincidences remain (~4860) but tone+energy independent.
- MEAS-ALL hygiene: now ISO-timestamped + file-writes fixed (label bug).

## Remaining caveat (assess)
The 4 measurements span ~5min of a STABLE-membership session (identical cids throughout) rather than one synchronized 20s instant: agent ~21:17, locals 21:21:09, host ~21:22. Membership consistent across all (same 4 cids). Is "all 4 receivers clean within one stable-membership session" sufficient for 'everyone hears everyone incl agent', or is literal same-20s-window simultaneity required?

## QUESTION
Given all 4 receivers now show clean matrixOk:true reception of the other 3 with consistent membership, is R5 (4-way full mesh, everyone hears everyone incl the remote agent both ways) genuinely PROVEN? VERDICT: PASS or FAIL + findings.
