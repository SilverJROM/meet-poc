# CR-FIX-1 — Fix the code red-team CR1 findings

You are the IMPLEMENTER (codex). Verifier != fixer. The 6-model CODE red-team found these in YOUR IMPL-1/2/3 diff. Fix ALL.
## FIRST tool call = callback: printf '[projcore callback] CR-FIX-1 STATUS: PROPOSED %s\n' "$(date -u +%FT%TZ)" >> <abs>/callbacks.md ; then plan → wait APPROVED-PLAN → implement → DONE.

## BUGS (fix every one)
1. **P0 SILENT-NO-BANNER residual.** `refreshBlockedState()` (remote-audio.service.ts ~527-534) treats blocked = `entry.blocked || el.paused`. The "play() resolved + element unpaused but sink emits NO audio" case (decode/sink stall = JROM's exact failure) leaves blocked=false → no banner, silent. The voice watchdog (room.page.ts ~2742-2779 / recoverVoicePlayout) detects bytes-rising-but-emitted-flat but only replays. FIX: add a per-publisher `voiceStalled` (or reuse blocked) state set when the watchdog's bytes-climbing/emitted-flat verdict fires for that publisher; feed it into remoteAudioBlocked so the banner SHOWS; clear it only when emission advances (emitted count rising) or a gesture-recovery proves emission resumed. Do NOT define banner truth solely by paused/play()-success.
2. **MED-HIGH subscribe rollback incomplete** (sfu-client.service.ts ~823-847, 1739-1792). The renegotiation branch calls flushPendingOntrack() which adds tracks to remoteStreams/remoteScreenStreams BEFORE createAnswer/setLocalDescription/PUT renegotiate resolve. rollbackSubscribeMutation restores midToEntry/subscribedTracks/timers but NOT the added streams → ghost streams + dup on retry. FIX: snapshot remoteStreams/remoteScreenStreams in the rollback closure and restore them on failure (or defer flushPendingOntrack until after the renegotiate commit). Keep it tight; add/extend a spec asserting a failed reneg leaves no ghost stream.
3. **MED diagnostics per-publisher vs global** (diagnostics.page.ts ~100-118 + the payload). `mediaPlayout` (audioLevel/totalAudioEnergy/totalSamplesDuration) is a CALL-WIDE stat but is rendered identically on every per-publisher row → misleading. FIX: render mediaPlayout ONCE as a call-wide row/section; for PER-PUBLISHER evidence use the per-publisher INBOUND `totalAudioEnergy` (add it to inbound capture if not present). Make the per-publisher table show real per-talker energy.
4. **MED reset() stale unlocked** (remote-audio.service.ts reset ~370-379): set `this.unlocked = false` (and reset per-call sink tracking like selectedSinkId if it's meant per-call) in reset(), with the registry teardown.
5. **LOW dead code** — remove the mixer-era leftovers: `remoteAudioMixerEnabled` (room.page.ts:222) + the dead tile `[remoteAudioEnabled]` bindings (room.page.html:250/270/290) + tile `(remoteAudioBlocked)` binding; `TileComponent.remoteAudioEnabled` input + `remoteAudioBlocked` output (tile.component.ts:23/26) if now unused; the `remoteAudioMixer` viewChild + `attachOutputElement(...)` effect (room.page.ts:510/632); and the vestigial `outputElement`/`attachOutputElement`/`attachOutputListeners`/`onOutputPlay`/`onOutputPause`/`outputPlaying` machinery in remote-audio.service.ts IF now unused. Keep only what's live. tsc/build must stay green.

## TESTS (add)
- silent-live: simulate watchdog verdict bytes-rising/emitted-flat → assert remoteAudioBlocked becomes true (banner) and clears when emitted advances.
- syncPeers replaces a publisher when the audio TRACK changes on the same MediaStream (mid-call unmute).
- reset() sets unlocked=false (cross-session hygiene).
- failed-reneg leaves no ghost remoteStreams entry.

## Constraints: frontend only; don't touch recorder; tsc --noEmit=0; run touched specs via npx tsx; ng build green; append CR-FIX-1 to changes.md; NO commit.
Reply STATUS: PROPOSED + how you'll close the P0 banner-latch + the rollback restore + per-publisher energy. Wait for APPROVED-PLAN.
