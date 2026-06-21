# RED-TEAM CHARTER — "don't give JROM a broken call"

JROM directive 2026-06-20: "red team this so you dont give this to me broken." Supreme bar = a REAL live call where JROM + Peer2 hear each other. This charter enumerates the ways an automated PASS could LIE about that. **Every audio-path batch (B1–B4) gate = codex55 validation + an adversarial red-team pass against this charter. No "fixed" claim survives unless it clears every applicable item, AND a final human live-call confirms.**

## The single question the red-team asks
"If this automated test is GREEN, name every concrete way JROM + Peer2 could STILL jump on a call and not hear each other." Each finding must be refuted with evidence or fixed.

## Attack vectors (must each be cleared)

### A — Join/admit fidelity
- A1: No force-admit / clientId / "ignore name" hacks bypassing the real knock→admit. (Already caught + reverted — VERIFY reverted in git.)
- A2: No host-owner auto-shortcut a real guest wouldn't get; the guest path is the real unauthenticated knock.
- A3: Guest joins the EXACT room the host hosts (no stale/wrong room).

### B — Media / ICE fidelity (a join without media = broken call)
- B1: connectionState MUST be `connected`/`completed` on BOTH peers — not just "admitted". (Current known GAP — ICE not connecting.)
- B2: A valid SELECTED candidate-pair exists; for the real long-haul JROM↔Peer2 path, expect `relay` (TURN) — `host`/`srflx` "succeeding" across the world is suspicious; TURN-present-in-config ≠ TURN-used → check `selectedWasRelay`.
- B3: No localhost shortcut that hides NAT traversal: the REAL call is JROM-host (his home network/NAT) + Peer2 (across world). An automated host on localhost:4700 does NOT exercise JROM's real NAT — flag this divergence; ideally drive the host via the public path too.

### C — Audio fidelity (the crux)
- C1: "inbound track present" / `bytesReceived>0` ≠ audible. Must prove the PEER's audio is DECODED at the RECEIVER: inbound-rtp bytes rising AND decoded-audio energy on the REMOTE track AND an audio sink that would actually play out.
- C2: Attribution — receiver measures the OTHER party's signal, not its own loopback (keep the distinct 440/880 spectral check).
- C3: Audio element not muted / volume>0 / autoplay not blocked — a real human hears nothing if the sink is muted even when stats look fine.
- C4: Fake-device vs real-mic divergence: `--use-fake-ui-for-media-stream` auto-grants what a real user must click, and fake audio bypasses real mic capture/AGC/EC and the pre-join DEVICE GATE (which already blocked us). Confirm the REAL-user flow (actual mic grant + device selection) also reaches in-call.
- C5: BOTH directions verified independently at each receiver (no one-way audio passing as success).
- C6: No DTX/comfort-noise false-positive (dual-criteria energy+bytes + magnitude sanity).

### D — Environment / realism divergence
- D1: Host under Playwright test-runner is a test artifact; a real JROM uses a normal browser — no test-runner-only behavior in the pass.
- D2: Signaling WS stable THROUGH the whole call — the observed host-ws/peer2-remote RECONNECTING ~right after admit would drop a real call; must be stable.
- D3: No debug/[GATE] instrumentation or test affordances left in prod code (deferral OFF).

### E — Reproducibility
- E1: Not one lucky pass — **2 consecutive clean end-to-end runs** (R6 / JROM's 2-success bar) before claiming reliable.

### F — The ultimate gate (non-negotiable)
- F1: No automated proxy fully substitutes for a human call. **Final acceptance = JROM + Peer2 on a real live call confirming they hear each other.** Until then, max claim = "automated end-to-end passes faithfully; pending your live call." Prepare a one-click real-call setup for JROM+Peer2 when JROM returns.

## Process
- Per audio batch: after grok's fix + codex55 validation, run a §1.4g red-team panel (elite tier given the stakes: opus + codex55 + sonnet + spark + haiku) over rotating lenses from this charter until N-consecutive-clean. Panel never writes the fix (verifier≠fixer).
- Findings → fix → re-test → re-red-team. Log to redteam/.
