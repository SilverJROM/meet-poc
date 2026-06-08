# opus verdict — T1 round 4

## Q1 — Architecture: Option A CONFIRMED
Dropping the AudioContext/mixer from the audible path is SAFE — I enumerated every consumer:
- **Recorder is fully INDEPENDENT** of RemoteAudioService: it has its OWN AudioContext (recorder.service.ts:84,117), its OWN `createMediaStreamDestination` (L119), and mixes peer streams via its OWN `createMediaStreamSource(stream)` (L297). It does NOT read RemoteAudioService's destination/sources. → retiring the mixer does NOT break recorded remote audio. (This rules out the scariest hidden regression.)
- The ONLY other consumers of the mixer/contextState are: the banner effect (room.page.ts:650-659 → B8), recover paths (B6/B7), volume/mute (B1), keepalive (subsumed). All are in the B1-B10 list. No hidden consumer outside debug/test hooks (room.page.ts:620-624).
- **Option A closes the failure REGARDLESS of A3-vs-A4:** no AudioContext → A3 (orphaned graph) is structurally impossible; direct `<audio srcObject=stream>` + `setSinkId` → the WebRTC-tested sink path → A4 fixed. We do NOT need to first prove which trigger fired. This is the decisive reason to prefer A over B (B keeps a MediaStreamDestination output → re-risks A4).
- Cost accepted: native volume cap 1.0 (B3) + no feedback limiter (B2). Both acceptable for JROM's remote-intl use; documented.

## Q2 — B1-B10 verification
| # | Verdict |
|---|---------|
| B1 | FIX-NEEDED detail: the tile effect HARDCODES `audio.muted = false` (tile.component.ts:61) EVERY run — the fix must REPLACE that with `audio.muted = mutedAll()` and `audio.volume = min(volume(),1)`, reactively (both signals), else the hardcode fights mute-all. |
| B2 | OK (accept removal + document; AEC covers remote use). |
| B3 | OK (cap UI to 100%). |
| B4 | OK but must dedup across ALL layouts (grid/share-stage/strip/pip) keyed by publisherClientId — exactly one audible element per publisher. Implementer must verify share-stage + strip don't BOTH render audible audio for the presenter. |
| B5 | OK in intent; implementer must trace sfu-client.service.ts:1100-1133 cap path and ensure the reclaim-safe guard NEVER lands a live publisher in "permanently stopped". Add the 2-publisher + mid-reuse test. |
| B6 | OK (per-element recovery in recoverVoicePlayout). |
| B7 | OK (per-element play in recoverPlayback !mixerEnabled branch). |
| B8 | OK (banner from "remote peers with streams exist AND any per-element paused/blocked"). |
| B9 | OK (apply sink in tile effect before play). |
| B10 | OK (keep slimmed service). |

## Q3 — End-to-end trace (revised design)
- join+gesture → host publishes: OK (unchanged publish path).
- A subscribes + audible on selected device: OK IF B9 (sink-in-tile-effect) lands — else first-frames race to default. Covered.
- B joins, both audible concurrently: OK — one `<audio>` per peer, no active-speaker gating (verified R3). Satisfies R2 + no-suppress.
- pick different output mid-call: OK — applySpeakerDevice queries all audio elements (room.page.ts:2648) + per-tile effect re-applies.
- volume / mute-all / unmute: OK IF B1 implemented (replace hardcoded muted=false).
- A screen-shares: RISK — B4 dedup MUST hold or echo. Covered by requirement; implementer verifies all layouts.
- A stops share / B leaves+rejoins: OK — tile unmount removes its element (no orphan); rejoin remounts + sink-applies.
- host backgrounds tab then resumes: RISK — iOS/Chrome may pause the `<audio>` elements; B6/B7 + the pointerdown/click interaction-recovery (room.page.ts:2801-2802) must re-play `[data-remote-audio]`. Covered IF B6/B7 implemented for per-element. **First-break candidate if B6/B7 are done weakly.**
→ No NEW break beyond the B-list when B1/B4/B6/B7/B9 are implemented as specified.

## New issue (11th+)
- **Cleanup item (minor, not a blocker):** after Option A, the muted per-peer "kickstart" elements (remote-audio.service.ts:552, dataset remoteAudioKickstart) become redundant and should be removed to avoid duplicate elements/leaks. Fold into FIX-A.
- No new ROOT failure mechanism. Recorder-independence CONFIRMED (not an issue).

STATUS: AGREE — Option A confirmed (recorder independent, no hidden consumer, closes A3+A4 regardless of trigger); B1-B10 are concretely fixable with the two sharpenings above (B1 replace hardcoded muted=false; B4 dedup across all layouts; B5 reclaim-safe traced); e2e clean when B1/B4/B6/B7/B9 implemented as specified. Remaining risk is implementation-quality on background/resume (B6/B7), not design.
