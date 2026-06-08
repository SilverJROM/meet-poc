# opus CODE red-team CR1

## Correctness: PASS (the fix is live and sound)
- `mixerEnabled()` = false (remote-audio.service.ts:193-195) → B11 flipped. `syncPeers` (240-260) drives the registry diff gated ONLY on `inCall`, NOT on mixerEnabled → the registry IS the active audible path (spark's B11-unreachable fear is NOT realized).
- syncPeers diff is correct: removes departed (251-253), adds/replaces when stream OR track identity changed (255-258 → B17/B21). 
- addPublisher (363-428): sink-before-play, no-autoplay, disposed/generation re-checks after both awaits, dedup, catch→blocked. Correct.
- bindSubscribedMid (sfu-client 1692-1717): reclaim-safe, one-shot warn, throw→rollback for live conflict, used in BOTH branches (1757/1780). Correct.
- Banner is registry-backed via this.remoteAudio.remoteAudioBlocked() (room.page.ts:642,648,670). outputPlaying no longer feeds the banner.

## Bugs found
| severity | file:line | what | fix |
|---|---|---|---|
| LOW (dead code, no functional break) | remote-audio.service.ts:175,213-238,375 | Vestigial mixer-output machinery: `outputElement`, `attachOutputElement`, `attachOutputListeners`/`detachOutputListeners`, `onOutputPlay/onOutputPause`, `outputPlaying` signal — the single audible mixer element was removed; this is now dead (attachOutputElement is only ever called with null). | Remove the outputElement/outputPlaying machinery + attachOutputElement; drop the `outputPlaying` signal or repurpose. |
| LOW (dead call) | room.page.ts:632 | `attachOutputElement(this.remoteAudioMixer()?.nativeElement ?? null)` — `#remoteAudioMixer` `<audio>` removed from HTML → always null. Dead call to a dead method. | Remove this effect line + the `remoteAudioMixer` viewChild. |
| LOW (inconsistent/dead) | room.page.ts:222 | `remoteAudioMixerEnabled = computed(() => true)` still TRUE while service mixerEnabled()=false. Makes the tile `[remoteAudioEnabled]="!remoteAudioMixerEnabled()"` bindings (room.page.html:250/270/290) dead (tile audio element was removed). | Remove `remoteAudioMixerEnabled` + the dead tile `[remoteAudioEnabled]` bindings; and the tile `(remoteAudioBlocked)` binding (270) if the tile no longer emits it. |
| LOW (verify) | tile.component.ts | Confirm the now-unused `remoteAudioEnabled` input + `remoteAudioBlocked` output were removed OR are harmlessly inert (build passed, so inert) — but they are dead. | Remove the dead input/output from TileComponent + template bindings. |

## Regressions from the mixer removal
None FUNCTIONAL found — volume/mute (setVolume/setMutedAll iterate registry, 197-209), recovery, banner all rewired to the registry; tsc/specs/ng-build green. The only residue is the DEAD code above (not a regression, but cleanup the no-dead-code policy requires).

## Silent-no-banner paths in the CODE
None found: remoteAudioBlocked is set true whenever an entry is paused/blocked (onPaused→refreshBlockedState) and the addPublisher catch sets blocked. The original silent-no-banner class is closed in code.

## Test adequacy
remote-audio.service.spec asserts outcomes (sink-before-play ordering, dedup, late-joiner play, banner on paused, reset clears, migration). sfu-client.spec covers coexist + live-conflict + stale-reclaim. Adequate. feedback-limiter.spec removed cleanly (limiter gone). Gap: no spec asserting the DEAD code is gone (n/a) — but a spec that no `<audio>` other than registry elements is created would catch future regressions (nice-to-have).

STATUS: BUGS — correctness PASS, but a required DEAD-CODE cleanup remains (vestigial mixer-output machinery in remote-audio.service.ts + room.page.ts + tile dead bindings). No functional defect; ship-blocker only under the no-dead-code policy. → one cleanup pass (CR-fix-1), then re-red-team.
