# B2 Independent Validation — projcore (verifier ≠ fixer)
2026-06-02. Commits 85749cb + 7ef5266 on feat/incall-media-always-enableable-20260602.

VERDICT: PASS. RF.1/2/3/4 VERIFIED. Live two-device feedback reduction = JROM hardware seat (software can't 100% kill cross-device acoustic coupling — documented).

Checks I ran independently:
1. Scope: mic-energy.ts(+27), remote-audio.service.ts(+21), media.service.ts(+18 log-only, pre-approved), spec files, artifacts. No SFU/B1-camera/diagnostics/layout. CLEAN.
2. Limiter: DynamicsCompressorNode (thr -3dB, knee 0, ratio 20:1, attack .003, release .25), inserted gain→limiter→destination. Confirmed ONLY edges are gain→limiter and limiter→destination (no leftover direct gain→destination double-path). No makeup gain ⇒ mute-all (gain=0) stays silent. Correct.
3. Constraints: EC/NS/AGC stay {ideal:true} (max non-breaking — {exact} would hard-fail); single chokepoint audioCaptureConstraints covers all 4 capture paths incl. B1 toggleMic. Verify-applied helper unappliedAudioProcessing + log-only line. Correct.
4. Specs (npx tsx): feedback-limiter PASS, mic-energy PASS, AND existing remote-audio-playability PASS + remote-audio-health PASS ⇒ no playout regression. 
5. Build: independent ng build exit 0.
6. Honest doc: changes.md states software reduces, cannot eliminate, two-device acoustic feedback (headphones/mute one device = total fix).

No regression: volume/mute-all gain semantics preserved (limiter downstream, passes silence); playout specs green.
