# req-matrix.md — meet-audio-playout

Acceptance = every row VERIFIED (by projcore, independently; verifier ≠ fixer).
Live-only items (real speaker output) are JROM-seat confirmation, flagged LIVE.

| Req | Batch | Acceptance (short) | Status | Evidence |
|-----|-------|--------------------|--------|----------|
| R1.1 | B1 | host inbound emitted>0 (audio actually rendered) | VERIFIED (live 2026-06-02 sess 5d9ec218: host emitted 2.7M+1.07M) | (LIVE / harness) |
| R1.2 | B1 | suspended AudioContext ⇒ not-playable ⇒ banner shows | VERIFIED | unit |
| R1.3 | B1 | resume()+play() re-armed on gesture & on source-add | VERIFIED | unit + manual |
| R1.4 | B1 | no regression: working direction still hears; vol/mute ok | VERIFIED | unit + manual |
| R2.1 | B2 | selecting non-default mic applies + UI keeps selection | VERIFIED | unit + manual |
| R2.2 | B2 | selection survives reopen + reload | VERIFIED (reopen); reload-restore PENDING-LIVE | unit + manual |
| R2.3 | B2 | revert mechanism identified + fixed, no fallback regression | VERIFIED | unit |

Batches: **B1** = R1 (host remote-audio playout). **B2** = R2 (mic-selection persistence).
B1 first (primary reported bug). B2 after B1 PASS.
