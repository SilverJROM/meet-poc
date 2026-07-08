# Decision — live validation approach for the recording mid-joiner timestamp-sync fix
Date: 2026-07-01 · source: projcore (autonomous, per JROM "do it autonomously, debate codex55 if needed, decide+log+move on")

## Context
Fix (offset each per-user transcript by joinedAtMs) is merged to main (24a8629) + deployed
(FE built w/ X-JoinedAtMs, BE live via tsx-watch). Already proven: 36/36 unit tests + real
local end-to-end (3 browsers, real speech, faster-whisper) — mid-joiner "Bob" landed at 17998ms
(join 17948ms + 50ms into own audio), not ~0. JROM greenlit "deploy + run Peer2 test."

## Decision
Two live validations, both against the deployed live app (localhost:4700 / voice.silverjrom.app):
1. **Automated live (reliable, deployed-pipeline proof):** 3 local headless browsers (owner host +
   early guest + mid-joiner) on live, real speech audio, ~3-5min, overlapping speech, mid-joiner
   joins ~mid-call. Verify the LIVE named-transcript offsets the mid-joiner correctly. Transcribe
   requested per-call with model=tiny (does NOT mutate live global setting, which stays medium).
2. **Peer2 real-remote (real WAN + SFU):** local owner host + Peer2's machine (via JohnnyOne relay)
   joins an active call as a real remote late speaker/mid-joiner, ~3-5min. Verify Peer2's per-user
   recording transcribes with a call-timeline-synced timestamp. Tear down Peer2's sessions after.

## Rationale
- Transport (mesh vs SFU) is irrelevant to the fix (recording captures MediaStreams + joinedAtMs on
  peer-join regardless); the automated run gives deterministic high-confidence coverage of the
  DEPLOYED build + live whisper. Peer2 adds the real-remote-human WAN confirmation JROM asked for.
- Did not spin up a full codex55 debate: approach is unambiguous given the fix is already
  end-to-end proven; codex55 reserved for a genuine fork/blocker.

## Cleanup
Auto-delete all test rooms/recordings/transcripts created on live by this run; tear down Peer2's
browser/relay sessions. Never touch JROM's real recordings/rooms.

## OUTCOME (2026-07-02)
Both validations GREEN. Automated live (mesh) + real-remote Peer2 (SFU) both confirm mid-joiner
sync on the deployed app. Fix delivered to main. Test artifacts + Peer2 sessions cleaned up.
