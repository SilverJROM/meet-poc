# Recording → transcription: per-speaker + mid-joiner timestamp sync

- **Type:** bug + verification request
- **Status:** ✅ FIXED + VERIFIED (unit + local e2e + LIVE deployed + real-remote Peer2) + DEPLOYED to main
- **Raised:** 2026-07-01 · **Closed:** 2026-07-02 · **Handler:** projcore
- **Commits:** `0019f7c` (fix) → `24a8629` (merge to main). FE built + deployed; BE live via tsx-watch.

## JROM verbatim (request)
> "have you tested the recording -> transcription? basically have each speaker have their own voice
> recording... transcription is done properly with time stamps (closely tied together even if a new
> joiner joins mid project, their time stamps sync with the calls time stamps)?"

## Bug found (JROM's instinct was right)
The combined-transcript merge (`named-transcript` endpoint) pushed each per-user transcript's
file-relative `startMs` AS-IS. A per-user recording begins when that participant's stream first
arrives, so a mid-call joiner's whisper timestamps start at ~0 = their JOIN moment — landing their
lines at the start of the merged timeline instead of at their real call-timeline position.

## Fix
Offset each speaker's transcript by their `joinedAtMs` (ms since recording start): sidecar (new
`X-JoinedAtMs` upload header persists it) → `.meta.json` participants[] fallback → 0. FE sends the
header; BE stores + applies it in the merge.

## Verification (4 ways, all green)
1. **Unit (36/36):** mid-joiner at 2min lands at 120500ms not ~500ms; meta.json fallback covered.
2. **Local e2e (isolated stack, real speech + faster-whisper):** mid-joiner "Bob" (joined ~17.5s in)
   → 17998ms. Per-speaker recordings + per-user attribution + overlapping speech confirmed.
3. **LIVE deployed (localhost:4700, mesh):** mid-joiner BobLate joinedAtMs 17847 → transcript 17867ms.
4. **Real-remote (Peer2's machine via JohnnyOne relay, real WAN + SFU):** Peer2Remote joined ~3.5min
   in (joinedAtMs 207140) → transcript placed at 237300ms (= join + 30s into his own audio, when his
   TTS started). Correctly on the call timeline, NOT at ~0.

## Cleanup
All live test rooms (3) + recordings (33 files) deleted; Peer2's browser/processes + relay session
torn down; isolated local stack destroyed. No JROM real data touched.
