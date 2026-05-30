# og-requirements — All-sides diagnostics + on/off switch + one-way-audio fix

**Run:** projcore-run-2026-05-29 · **Coordinator:** Claude /projcore · **Implementer:** Claude /lead (Opus) in tmux `lkvc-opus` · **Topology:** 2-agent (projcore = coordinator+validator)

## Origin (the trigger)
JROM, 2026-05-29: a US user with an **external mic** joined a call — the US user could hear JROM, but **JROM could not hear the US user**. They fell back to Google Meet, which worked.

**Diagnosis (from 1,561 persisted diagnostic records, 2026-05-28):** one-way audio = the remote peer's **published audio carried almost no RTP** (sender-side capture failure), NOT a network/downlink/SFU-subscribe failure. Per-publisher inbound stats from JROM's seat: quiet peers had `packetsReceived` 45–441 for the whole call, `bytesReceived` 2.8–23 KB, **`packetsLost ≈ 0%`**, `concealedSamples` 600k–915k (**60–95% concealment**) — while the SAME peer's **video flowed normally**. 0% loss ⇒ downlink fine; video fine ⇒ peer connection fine; absent audio RTP ⇒ remote mic not actually captured (silent/wrong device). Recurs across several 2026-05-28 calls ⇒ systemic.

**Diagnostics blind spot:** guests DO upload diagnostics, but `outboundAudioLevel`/`outboundAudioEnergy`/`micSilent` are **null in 100% (1561/1561) of samples** — the local mic-energy metric is never populated, so we have no source-side proof of a silent mic.

---

## Requirements (the contract)

### Theme A — Diagnostics so we can diagnose audio on all sides
- **R1 — Local mic-energy metric populated on ALL clients (host + guests).** Every diagnostic `sample` must carry real, non-null `outboundAudioLevel`, `outboundAudioEnergy`, and `micSilent`. (Today: null in 100% of samples.) This is the source-side signal that proves whether a participant's mic is actually capturing audio.
- **R6 — Guest/all-sides reliability + per-participant attribution.** Guest participants' diagnostics upload reliably for the whole call (incl. across reconnect), and each stored sample is **attributable to the specific participant** (clientId / clientName / participantId) and queryable — so a host can review every side of a call, not just their own.
- **R7 — Surface remote audio health in the diagnostics view.** The existing per-publisher inbound stats (`bytesReceived`, `packetsReceived`, `concealedSamples`) are surfaced in the diagnostics UI so a **silent remote is visible at a glance** (a peer with near-zero audio bytes + high concealment is flagged), not buried in JSON.

### Theme B — On/off switch (JROM: "add an on/off switch ... so that when we are at a certain point we can just off these")
- **R4 — User-level diagnostics on/off toggle.** A visible toggle in Settings (default **ON**). When OFF, that client stops collecting AND uploading diagnostics. Persisted.
- **R5 — Global/admin diagnostics kill-switch.** A master switch (admin/global) so diagnostics can be turned off **globally**. When OFF: backend stops accepting/persisting diagnostics AND clients learn to stop collecting (via the existing config/me surface). Reuses existing admin auth — NO new auth/RBAC boundary.

### Theme C — Fix the actual one-way-audio bug at the source
- **R2 — Silent-mic detection + actionable warning.** When a participant's mic is **enabled and unmuted** but no audio energy is detected for a sustained window (uses R1's signal), the app warns them with a **non-blocking, actionable prompt** ("We can't detect sound from your microphone") and offers to **switch microphone** (opens the device picker). Clears when audio is detected.
- **R3 — Robust microphone selection (external mic actually used).** The user's chosen input device is used on join and in-call; on a silent/failed default the app does not silently publish a dead track — it attempts recovery and/or surfaces R2. An external mic that works in Google Meet must be selectable and capture audio here.

---

## Out of scope (this run)
- Rewriting the SFU/transport layer (covered by the prior sfu-optimization run).
- Per-peer volume/mute UI.
- Any PROD deploy (no PROD exists). DEV = `voice.silverjrom.app` only.
- Full 2-hr e2e capstone (focused feature; targeted + manual proof per north-star).

## Acceptance
Every R# row in `req-matrix.md` reads `VERIFIED` (projcore independent validation, USER-seat closure), build green FE+BE, and the one-way-audio fix is demonstrable: a forced-silent mic raises the warning and is recorded as `micSilent:true` in diagnostics.

---

## Injected 2026-05-29 (NS10)

### R8 — Device self-test fidelity (no false pass)
The pre-call "test/configure devices" mic check (lobby/preview) must measure the **same capture path the call will publish** — same selected device, same getUserMedia constraints, and the same published-audio-level signal used by diagnostics (R1) — so a microphone that will NOT transmit on the call **cannot show as "working"** in the test. When no input energy is detected from the selected device for a sustained window, the test **clearly flags it** ("No sound detected from <device> — pick another") and warns the user before they join. **The pre-call test result must match in-call reality.** JROM: "its unacceptable to pass that and yet when on a call it does not work."

### R9 — Back-to-rooms control on the /join page (re-requested)
The `/join` page (room-name/password entry) must have a clear **back-to-room-list** control. Yesterday's back link landed on the in-call lobby, not the /join page — this request was not fully met. For signed-in users it navigates to the rooms list (e.g. `/app/rooms` — confirm route); for guests (who have no room list) it falls back to a sensible target (home/login) or is hidden. JROM: "i dont see a back button from the join page back to the room list i requested this yesterday."

### R10 — Automatic fallback across available microphones (amends R3/AC5)
On confirmed sustained silence (mic enabled+unmuted), the app re-acquires the current device once, then automatically tries each OTHER available microphone and adopts the first that produces audio energy (switching to it and notifying the user which device). ONLY when NO available microphone produces energy does it surface the error prompt. Recovery stays non-destructive (never zero audio tracks) and bounded to one sweep per silence episode (no thrash). JROM: "use a fallback of the other available mics when one mic fails and when there is non just prompt the user about the error."
