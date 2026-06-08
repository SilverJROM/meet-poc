# IMPL-1 — independent validation (projcore, verifier != fixer) — 2026-06-08

VERDICT: PASS (code-level). Real-call confirmation deferred to final VALIDATE.

## Re-ran independently (not trusting self-DONE)
- `npx tsc --noEmit` → exit 0.
- `npx tsx` remote-audio.service / -watchdog / -health / -playability specs → all assertions passed.
- `npx ng build` → exit 0 (pre-existing MediaPipe/Stencil warnings only).

## Diff review (7-gate)
- Scope: frontend only, 9 files (446+/430-). Backend + recorder UNTOUCHED (grep clean). No new TODO/FIXME/deferral.
- addPublisher (remote-audio.service.ts:363-428) faithful to design v2.2: inCall+track guard; dedup; NO autoplay attr; srcObject; volume/mute pre-play; listeners→blocked; register+append before play; setSinkId via withTimeout BEFORE play; staleness re-check after sink AND after play; play→catch→blocked; refreshBlockedState.
- Banner registry-backed (size>0 && any paused/blocked). Tile <audio> + mixer element REMOVED → share-echo (B4) impossible by construction. Volume capped 1.0 + stored-migration. Sticky unlocked flag present.
- Specs assert: sink-before-play ordering, no-autoplay, per-element vol/mute incl mute-all=0, reset clears registry, late-joiner-auto-play after unlock, banner on paused/clears on play, dedup one-element-per-publisher, 1.3→1.0 migration, sink fallback/coalesce.

## Req coverage
- R1 (host hears every remote publisher): CLOSED at code level (registry direct-stream + sink-before-play fixes A4; no AudioContext fixes A3; banner-on-paused kills silent-no-banner).
- R2 (all concurrent publishers): concurrency CLOSED (one element per publisher, no gating); never-drop-a-voice mid-guard = IMPL-2.
- R3 (diagnostics): IMPL-3.

## Not yet proven (by design — needs the real call)
Real-device US<->PH audibility = final VALIDATE after IMPL-2/3 + code-redteam + live rebuild. Fake-media cannot prove real playout (2026-06-04 lesson).
