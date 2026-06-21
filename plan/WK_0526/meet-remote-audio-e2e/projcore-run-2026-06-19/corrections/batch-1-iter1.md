# Batch-1 correction iter1 — R2 NOT met (gate FAIL on self-DONE)

## Why FAIL
grok emitted DONE, but R2 acceptance = host shows ADMITTED remote tile + remote ICE connected/publishing. That was NOT achieved: remote never admitted, no remote ICE, and the diagnosis shows the remote guest **never constructs the signaling WebSocket** → no knock server-side (backend logs confirm zero guest/knock activity). Diagnosis is good; the "beyond the harness" conclusion is premature.

## Key disambiguating fact
In **B0**, the LOCAL guest (driven by the B0 rig) constructed its signaling WS, knocked, got admitted, and audio flowed both ways — VERIFIED. So the join flow CAN open the WS. The standalone `e2e/scripts/peer2-remote-join.mjs` most likely DIVERGED from that working B0 guest path: it reaches a visual "knocking" UI state without performing the actual join action that constructs the WS + sends the knock.

## Required fix (the ONE gap)
Make the remote guest on creepy-mini replicate the EXACT B0 guest-join sequence that worked — same lobby preflight + device grant + the precise "Ask to join"/join interaction the B0 rig used to open the WS. Reuse the B0 rig guest-join code path verbatim where possible (run it standalone on creepy-mini with system chrome). Then RE-VERIFY by `pm2 logs meet-poc-be` showing a guest knock + waiting entry for your room id, host admits, remote ICE reaches connected/completed, and capture the SELECTED candidate-pair type (relay/srflx/host) + RTT on the remote.

## Escalation branch
ONLY if the WS still never constructs even with the faithful B0 path → it IS a real app/long-haul bug. Then capture the exact remote console error at the WS-construct point (the monkey-patch already in place) + the app code that constructs the signaling WS, and we escalate to an app-level fix (likely origin/lobby-gate/long-haul). Do NOT conclude this until the faithful B0 path is tried.

## Bar
Do NOT declare DONE until the host actually ADMITS the remote and remote ICE reaches connected/publishing, with both-ends evidence. Verifier ≠ fixer: this brief specifies the gap; you implement.
