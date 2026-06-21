# RED-TEAM PACKET — voice + multiparty fix (R2/R3/R4/R5)

CLAIM: Peer2's machine (creepy-mini, real C930e mic) joins our meet-poc call (Cloudflare TURN+Calls SFU) and audio works fully, proven 2/3/4-way full-mesh with explicit per-pair measurement.

EVIDENCE (verify it's genuine, not gamed):
- Clean single-window 4-way 12/12: pm2 agent-host [HOST-MEASURES-ALL] passAllExpected:true (host hears agent660/local1-940/local2-1100, each 20s energy + spectral peak matching tone + bytes); /tmp/r5-l1.log [LOCAL1-MEAS-ALL] passAllExpected:true; agent /tmp/peer2-4way-r5.log passAllExpected:true (perTone host440/local1940/local21100), ICE connected.
- 2-way clean simultaneous matrix earlier (host↔agent 3/3 each).
- Fixes: removed ?sfu=0 harness quirk; non-blocking pre-join device gate (R10 — speakerVerified no longer blocks join, only mic+browser permission); micWorking authoritative; server auto-admit; 15s heartbeat (stops 1006 idle drop); deterministic join; per-publisher per-track FFT attribution rig; non-harmonic tones 440/660/940/1100.

YOUR TASK (each panelist, independent, READ-ONLY): scrutinize whether the CLAIM is genuinely true:
1. Is the matrix evidence REAL per-pair (energy>=3s + spectral-attributed-to-that-tone + per-pub bytes) or could it be gamed (mixed/global stats, comfort noise, stale map, attribution wrong)? Check audio-rig.ts measureRemoteAudio + the local-client scripts + agent perTone logic.
2. Real-user fidelity: does the agent/test path match a real user (R10 zero-setup: open URL → grant mic/cam → works; no script-only quirks like ?sfu)? Any divergence?
3. Regression risk to REAL users from the fixes (non-blocking device gate, auto-admit, heartbeat, micWorking)? Does a real speakerless user still join + work? Does auto-admit open a security hole?
4. Is LOCAL2's measurement also confirmed (my grep didn't surface its row — verify pm2 logs local2-client shows LOCAL2-MEAS-ALL passAllExpected)?
5. Verdict: PASS (R2/R3/R4/R5 genuinely verified) or REVISE (specific gaps). Be adversarial.
