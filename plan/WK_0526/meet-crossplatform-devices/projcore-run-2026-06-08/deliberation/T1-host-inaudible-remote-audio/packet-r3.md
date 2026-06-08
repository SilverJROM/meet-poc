# DELIBERATION T1 — host-inaudible-remote-audio — ROUND 3 (RED-TEAM the fix)
# (Your role = the model you run as.)

## 0. READ FIRST (this dir)
- `consensus.md` — the AGREED root cause + fix plan you must now TRY TO BREAK.
- `anchor.md`, `jrom-evidence-addendum.md` — frame + host facts (unchanged).
- `../../north-star.md` "Injected directive 2026-06-08" — the app must NEVER suppress any voice; everyone audible concurrently; NO talker-limiting logic. The fix must honor this.

## 1. Mode shift: you are now a RED TEAM
Root cause + fix are at unanimous consensus (R2). Your job this round is NOT to re-find the bug — it is to **BREAK the fix plan in consensus.md before we touch code.** Assume the fix ships as written; find every way it fails, regresses, or misses.

## 2. Attack these specifically (evidence at file:line)
1. **Regression: why did the single Web-Audio mixer exist?** It provides volume control (gain), mute-all (gain=0), and a brick-wall FEEDBACK LIMITER (FEEDBACK_LIMITER_PARAMS, remote-audio.service.ts:58,518-527) taming same-room feedback. If we retire the mixer from the audible path and play per-publisher `<audio>` elements directly: do we LOSE volume control, mute-all, and feedback suppression? How are `RemoteAudioService.setVolume`/`setMutedAll`/`volume()` (controls-bar.component.ts:71,109,121) honored on per-element playout? Propose how each is preserved or flag it as a blocker.
2. **Does re-enabling tile audio actually deliver to the SELECTED device?** Trace: tile `<audio data-remote-audio>` (tile.component.ts:39-66) → does it ever get `setSinkId(selectedAudioOutputId)`? `applySpeakerDevice()` (room.page.ts:2648-2658) claims to reapply sink across all media elements — VERIFY it actually selects the tile audio elements and runs on peer-add, not just on device-change. If a new tile mounts after the last device-change, does it get the sink? Or does it default to system default (re-introducing A4 on the per-element path)?
3. **Still-can't-hear scenarios:** autoplay on the per-element path (tile.component.ts:57-65 emits `remoteAudioBlocked` on play reject) — is the unlock/gesture recovery wired for tile elements, or only for the mixer? Any path where the tile audio element stays paused with no banner?
4. **Does the fix preserve R2 (all concurrent publishers audible)** with NO suppression (per JROM directive)? Confirm per-tile audio = one element per remote peer, all unmuted, none gated by active-speaker.
5. **B guard correctness:** does the mid-overwrite guard at sfu-client.service.ts:1753 risk THROWING on a legitimate CF mid reuse and breaking subscribe? Could the guard itself drop a publisher (violating no-suppress)? 
6. **R3 diagnostics:** any field that won't populate / wrong stat-type / privacy (egress id) concern? Will it actually disambiguate A3 vs A4 next call?
7. **7th mechanism hunt:** anything in consensus.md mis-attributed, or a NEW failure mode not yet listed.

## 3. Output — write `<role>-verdict-r3.md`:
```
# <role> verdict — T1 round 3 (red-team)
## Blockers found in the fix plan (each: what breaks + file:line + how to fix)
## Regressions the fix would introduce (volume/mute-all/feedback-limiter/sink/autoplay) + mitigation
## Confirmations (fix points that survive red-team)
## New issue / 7th mechanism (or "NONE — fix plan sound")
STATUS: AGREE — <fix plan is sound as-is OR sound with these named adjustments>
   OR
STATUS: REVISE — <one-line blocker that must change before implementation>
```
Be adversarial. A clean round only counts if you genuinely tried to break it. Evidence at file:line. No code edits outside your verdict file.
