# og-requirements — Restore real-call audio (volume-vs-mic regression)

**Effort:** meet-realcall-audio-fix · **Run:** projcore-run-2026-07-08
**Authored by:** /north (session-bootstrap 2026-07-08) · **Phase:** pre-live hardening
**Project north-star:** `/home/agjrom/websites/meet-poc/north-star.md`
**Effort north-star:** `./north-star.md`

---

## 1. Verbatim problem (in JROM's words)

**The regression, today's failed call (2026-07-08, ~09:44 Manila, room "ReceiptBOT"):**
> "i want to setup a new fixes cycle can you review the latest call this morning ph time as i cant
> hear the user and he may be able to hear me, but after multiple tries we opted to change to google
> meet, the app is not at a good working condition right now."

**The cause chain, in JROM's words:**
> "the previous issue was that one of the joiner's volume is very low that we cant hear her so i asked
> for a fix and this is the result."

**The original request that led to the shipped fix (logged 2026-07-03, `plan/WK_0701/list/2026-07-03-per-voice-volume-balancer.md`):**
> "some of the voices on the app has very low volume and hard to hear it was very silent even on max
> volume, can we add a sort of balancer on the app where if the voice is kind of low volume we amplify
> it and try to make all voices have the same volume... enough to be 85-90% of the loudest or highest
> volume of the call... this is kind of like an equalizer of sorts on the voice."

**The acceptance ask, in JROM's words:**
> "just fix it both can hear each other and anyone can share screen and view each other on the app.
> this was sort of working last week's call after the recent changes to standardize the volume did we
> have this."

**One-line framing:** a fix requested for *"a participant is too quiet"* appears to have regressed the
call into *"the participant is fully inaudible"* — a strictly worse failure. Restore full real-call
audio **without** losing the quiet-voice remedy.

---

## 2. Evidence (already gathered — the call, not a hypothesis)

From session `652c1475` diagnostics (`data/meet-poc.sqlite`), 2026-07-08 09:44–09:56 Manila:
- **One-way audio, remote→local dead.** Local "JROM" (desktop) mic healthy (level varied 0.005–0.497).
  Remote "Acctg" (**Android 10 / Chrome Mobile 150**) outbound audio never reached the call. Acctg's
  subscribe to JROM's track was healthy (`connectionState: subscribed`) → Acctg could hear JROM.
- **Acctg rejoined 4 times in 12 min** (4 distinct participant_ids) — the "multiple tries."
- **Failure Mode A (worst, ~3 min):** `outboundAudioLevel` FROZEN at the exact constant
  `0.228949858088931` on every sample; `micSilent` stayed **false** → the silence detector was fooled
  and never fired the self-heal. App believed the mic was fine while JROM heard nothing.
- **Failure Mode B:** later clients correctly showed `micSilent=true`, `outboundAudioLevel=0` (one fully
  dead at `energy 0.0`); **never recovered**.
- JROM confirms Acctg was **unmuted and speaking**, and this device's audio **worked on earlier calls**
  → regression, not client hardware.

---

## 3. Acceptance criteria (UI-provable, real-call — the validator's Q0 seed)

Each must be provable by driving the running app on a real call, not by synthetic/fake-media tests alone.

1. **AC1 — Bidirectional audio.** On a real call between a desktop host and an **Android-mobile**
   participant, each side hears the other's live speech (decoded + rendered), sustained for the call.
2. **AC2 — Outbound mic is live, not stuck.** The Android participant's outbound mic level tracks real
   speech — it is **not frozen at a constant** and **not stuck at zero while the user is speaking**.
3. **AC3 — Frozen-mic is detectable (close the Mode-A blind spot).** Dead-mic detection flags a
   **flatlined non-zero level** (zero variance over a window) as a dead mic and triggers recovery — not
   only the literal-zero case.
4. **AC4 — Self-heal actually recovers.** A mic that goes silent/frozen mid-call recovers automatically
   (or is clearly surfaced to the user) **without the user leaving and rejoining repeatedly**.
5. **AC5 — Screen share.** Any participant can share their screen; others can view it.
6. **AC6 — Video.** Participants can see each other.
7. **AC7 — No regression of the quiet-voice remedy.** Quiet participants remain audibly leveled toward
   ~85–90% of the loudest; the mic fix does **not** reintroduce the "too quiet to hear" problem.
8. **AC8 — Real-call proof.** Passes on JROM's **Android tablet** retest first, then **holds on a live
   client (ReceiptBOT) call** with the real participant.

---

## 4. Constraints & non-negotiables
- **Real-call acceptance bar** (project north-star §4): "fixed" = a real human live call works. Synthetic
  passes are necessary-but-not-sufficient. Red-team every audio result.
- **No access to the client's device.** JROM's **Android tablet is the retest surrogate** pre-live; the
  live-client call is the final proof. This bounds what "verified" can mean before the next client call.
- **Pre-live ⇒ deferral OFF.** No follow-up-PR / TODO-later. Everything gates run completion.
- **Deploy model:** the FE is a static bundle — a fix is NOT live until `ng build` + deploy. R1 self-heal
  is currently **unmerged (branch only)**; the live build is 2026-07-06.
- **Media plane:** Cloudflare Realtime SFU (media not via backend); STUN-only (TURN deferred).

## 5. Open threads to resolve AT PLANNING (diagnosis, not assumed here)
These are deliberately unresolved — they are the deliberation's job (see `topology.yaml`,
`planning_criticality: critical`):
- **T1 — Pin the actual regressing change.** The volume-standardization work is the leading suspect by
  timeline, BUT the logged balancer issue reads "NOT STARTED (R5)" as of Jul 4, and a first pass shows the
  **published mic track is the raw gUM track** (no WebAudio graph on outbound) — so the mechanism is
  unproven. Reconcile *what actually shipped in the 07-06 build* vs git history; identify the real cause
  (gUM constraints? shared AudioContext suspend on Android? the R1 mic-energy change? the receive-side
  balancer bleeding into capture?).
- **T2 — Fix the detector gap (Mode A)** and the recovery gap (Mode B) for Android capture.
- **T3 — Process reconciliation:** the 2026-07-05 projcore run swept 10 voice batches to "verified," yet
  this real call failed. Determine the evidence-quality gap so the fix is proven the RIGHT way this time.

## 6. Explicitly out of scope
Enterprise admin, large/webinar-scale, Lokal integration (project north-star §7), TURN/coturn standup
(separate deferred decision), and any non-audio feature work. This effort is: **make a real client call
fully work again, both directions, with screen share and video, without regressing the quiet-voice fix.**
