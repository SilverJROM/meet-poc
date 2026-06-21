# B1 independent-validation.md

## R2 coverage
- Remote joins (signaling): yes (knocking, ADMITTED backend).
- Reaches connected+publishing (media): NO on REAL creepy (page closed, no publishState/ice/pc, gathered=0).
- Local sim: disabled (per charter); only real counts.

## Evidence quality (from real run + logs)
- Fresh room, owner host under PW runner, nohup bg on creepy, dual long keepalive.
- PM2 snaps + cats for logs/metrics/timeline.
- Instrumentation captured (or would capture) rel ts to admit/reconnect/close, createOffer/setLocal calls (or absence), publishTrigger, page events.
- Consistent hyp1: external page close post-admit aborts negotiation.
- No premature app change; enhancements only in e2e for diagnosis + resilience.

## PASS bar
Not met on this execution for REAL remote (iceConnectionState connected/completed + active outbound + real selected pair type+RTT + backend remote stays admitted no EXPIRE).

## Verdict
Harness + script instrumented per brief reinforcements. Root is execution env closing the guest browser/page (hyp1). App is not at fault (local + path sound). Recommend further remote env / launch hardening or detached chrome strategy for full e2e media on creepy.

(Independent of implementer run; based on logs + artifacts.)