# og-requirements.md — meet-audio-playout (contract)

JROM verbatim:
> "i just had a call with a user (from the US) and he was able to hear me and see my video but, i cant hear him, he is able to share screen that works but the voice is still broken on his part, he tried joining on a phone with the same issue please check the diagnosis and fix this"
> "and by the way he is trying to select a mic but its not persisting can you check that as well"

---

## R1 — Host reliably hears remote audio (fix the mixer playout / suspended-AudioContext bug)
The host (and any participant) must **hear** remote participants' audio. Today the host receives the audio RTP cleanly but `jitterBufferEmittedCount` stays 0 — the Web-Audio mixer's `AudioContext` is suspended (or the mixer element never played), so nothing reaches the speaker, and no warning is shown.

**Acceptance (observable):**
1. In a two-participant call where the host joins first and a guest joins after, the host's inbound remote-audio track shows `jitterBufferEmittedCount` increasing over time (proven in a test harness or a localhost repro with the debug snapshot), i.e. the remote audio is actually rendered.
2. The playability/blocked detection treats a non-`running` `AudioContext` (when remote audio sources exist) as **not playable** → the existing `remoteAudioBlocked` banner surfaces, giving the user a one-tap "enable audio" recovery. (Unit-provable over the decision function.)
3. `AudioContext.resume()` + mixer `play()` are (re)attempted on genuine user gestures and when a remote source is added while the context is not running — not only once at join.
4. No regression: a participant who already hears audio keeps hearing it; volume + mute-all still work.

## R2 — Microphone selection persists
When a user selects a microphone in the device picker, that choice must **stick**: it is applied to the live capture, reflected in the picker UI (doesn't silently revert to default/another device), and persisted across reopen/reload. Reported by the US user: "trying to select a mic but its not persisting."

**Acceptance (observable):**
1. Selecting a non-default mic in the device picker applies it (capture switches) AND the picker continues to show the selected device (no snap-back to a different entry).
2. The selection survives reopening the picker and a page reload (persisted), subject to the device still being present.
3. Identify the exact revert mechanism (e.g. `ensureSelectedAudioDevice`/`preferredDeviceId` overwrite at room.page.ts:1923-1930, or `replaceInCallAudio` resetting `selectedAudioId` to the track's actual deviceId at :2113) and fix it without breaking the legitimate "device unplugged → fall back" behavior.
4. Unit-provable over the persistence/selection decision; manual localhost note for the picker UX.

---

## Out of scope (NS6)
SFU subscribe/transport, sender-side capture/mic-energy, diagnostics schema/attribution, the diagnostics on/off toggle, layout/grid. Do not touch.
