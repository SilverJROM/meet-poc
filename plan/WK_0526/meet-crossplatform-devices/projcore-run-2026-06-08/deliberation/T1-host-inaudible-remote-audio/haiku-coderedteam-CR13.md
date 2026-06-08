# Haiku CODE red-team CR13 (lens L13: CRITICAL talk/record/see)

## TALK (be-heard / hear-others): any CRITICAL break? (file:line) or none

**be-heard (remote → host/others via SFU):** Publish path untouched. No changes to sfu-client.ts subscribe/publish logic in this diff. **NO ISSUE.**

**hear-others (host receives remote audio):** Remote audio registry-based playout implemented correctly:
- **addPublisher (remote-audio.service.ts:450–542):** Creates hidden `<audio>` element, sets `srcObject = stream` (L459), applies sink ID (L502) **before** `await el.play()` (L524). Order is correct per spec.
- **Playback path:** Element plays via native HTML5 audio, not Web Audio mixer. setSinkId applied per element at L558, NOT to a shared mixer. Registry tracks per-publisher blocked state via onPaused/onPlaying listeners (L463–481).
- **Recovery (replayRegistryElements):** Replays individual elements on demand (L594 `await entry.el.play()`), updating sinkApplyResult and blocked state per entry. Path is sound.
- **Two-concurrent-audible:** Test CR-FIX-5 R2 (remote-audio.service.spec.ts:324–350) verifies both publishers simultaneously play, block=false after removal. Would fail if either was displaced. ✓
- **Voice-stall latch:** voiceStalled flag latches unblock banner (remoteAudioBlockingReason L650), cleared only when emitted climbs, bytes stop, or mute-all (room-decisions.ts:2157–2167). Banner is UX feedback, not playback blocker. No audio-silencing side effect. ✓

**NO CRITICAL BREAK.** Registry playout maintains concurrent audibility per spec. Per CR12: test coverage is complete and outcome-focused.

## RECORD (audio+video captured): any CRITICAL break? or none

**Out of scope per anchor.md L30.** Recorder service unchanged in this diff. Remote audio is now in registry `<audio>` elements (not mixer), but recorder integration is not touched here. No read-side change to `recorder.service.ts` recording flow.

**NO CRITICAL BREAK.**

## SEE (video received): any CRITICAL break? or none

Tile video element retained (tile.component.html, `<video #video ...>`; L112 logic unchanged). Remote audio audio-sink element removed (L109–111 deleted), but **that element was never a video sink**—only audio. Video logic untouched: displayStream binding, srcObject assignment, playback semantics identical.

**NO CRITICAL BREAK.**

## Findings (each tagged [CRITICAL] or [NON-CRITICAL], file:line) or "none"

**NONE.** Voice-stalled banner latch is intentional UX (CR-FIX-1 test confirms: audible but banner latched until emission advances). Registry implementation is cohesive: playback order correct (setSinkId→play), blocking conditions honest (remoteAudioBlockingReason), recovery deterministic (replayRegistryElements per entry).

---

STATUS: **CRITICAL-CLEAN** — no CRITICAL break of talk/record/see. Registry playout is audible per spec; video unchanged; record out-of-scope.
