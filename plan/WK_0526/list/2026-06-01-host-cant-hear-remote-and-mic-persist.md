# 2026-06-01 — Host can't hear remote audio + mic selection not persisting

- **type:** bug (×2)
- **status:** FIXED + deployed (VERIFIED; 2 live-confirmation items reserved for JROM seat)
- **agent:** projcore
- **run:** plan/WK_0526/meet-audio-playout/projcore-run-2026-06-01
- **qa_verification:** projcore independent validation PASS for both batches (unit specs re-run, diffs read, builds green, live bundle==HEAD, merged master 63d6f94). LIVE-PENDING: R1.1 real audio + R2 reload-persistence = JROM two-machine seat.

## JROM verbatim
> "i just had a call with a user (from the US) and he was able to hear me and see my video but, i cant hear him, he is able to share screen that works but the voice is still broken on his part, he tried joining on a phone with the same issue please check the diagnosis and fix this"
> "and by the way he is trying to select a mic but its not persisting can you check that as well"

## Diagnosis (proven from session b35a94c9)
Host-only remote-audio PLAYOUT failure: JROM receives Peer2's audio RTP cleanly (1.4 MB, ~0 loss, 0 concealment) but `jitterBufferEmittedCount`=0 — Web-Audio mixer `AudioContext` suspended / mixer element never played; playability check ignores `context.state` so the "audio blocked" banner never shows. NOT a capture bug (Peer2's outbound energy is healthy on both laptop and phone). Distinct from yesterday's sender-side silent-mic fix. See run diagnosis-evidence.md.

## Handling
- **B1 (R1):** fix mixer playout / suspended-context detection + re-arm + honest blocked banner.
- **B2 (R2):** fix mic-selection persistence/revert.

Implementer: /lead (hyper-focused, one batch) on a separate tmux session; projcore validates independently.
