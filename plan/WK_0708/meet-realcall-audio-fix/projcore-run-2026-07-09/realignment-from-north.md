# REALIGNMENT — /north → projcore (2026-07-09, post-codex55 consult)

**JROM authorized this autonomously** ("offload this to you and do it autonomously… stop grok projcore,
realign him with the additional changes and restart planning again… use codex55 until <1%").

You were stopped mid-B04-reopen. **Nothing you built is discarded.** Re-plan from Phase 0.5 with the scope
below.

## What is BANKED (do not redo, do not revert)

11 commits on `batch-01-diagnosis-2026-07-08`. **B01–B07 remain VERIFIED**:

| batch | commit | what |
|---|---|---|
| B01 | `eada423`,`b0f2bce`,`22db4f4` | call-budget ledger + delete guards (protects `652c1475`, `TEST_ROOM01`) |
| B02 | `058af0e`,`202f156` | recording/transcript arbiter, loudness analysis, `PASS/FAIL/INVALID` |
| B03 | `27a5ef7` | fixed-clock scheduler, async LLM brain |
| B04 | `6a16127` | **VOID for its T_gap** (D27); harness code stands, the number does not |
| B05 | `df13135` | forced gUM shim + stimulus verifier |
| B06 | `2850c2a`,`45c2d7b` | faithful PipeWire weak-source (live `pactl` proof) |
| B07 | `3b19bfa` | Mode-A/Mode-B capture injection contracts |

Still true: **0/25 calls burned**, **0/18 ACs closed**, T_gap VOID with `T_gap_provisional = 500 ms`
(wiring only, closes nothing).

## READ THESE, IN ORDER

1. `decisions/2026-07-09-codex55-consult-turn-refuted-sender-liveness.md` ← **D28, the reason you stopped**
2. `og-requirements.md` (AC4 amended; **new AC15, AC16, AC17, AC18**; AC1 gain-fix direction + `A` reference)
3. `decisions/2026-07-09-north-voids-tgap-3400.md` (D27 — still binding)
4. `decisions/2026-07-09-harness-team-and-scope.md` (D14–D26 — still binding)
5. `north-star.md` (effort) and `/home/agjrom/websites/meet-poc/north-star.md` §6 (**corrected**: Cloudflare
   TURN is LIVE; one bundled `RTCPeerConnection` carries both directions)

## What changed, and why (D28)

**/north's TURN→STUN hypothesis is REFUTED.** `sfu-client.service.ts` holds ONE bundled
`RTCPeerConnection` (singleton, one `new RTCPeerConnection` at :2156) carrying both directions. Acctg
**could hear JROM** ⇒ ICE/DTLS/SRTP was alive ⇒ no transport/NAT/TURN failure can selectively kill only
her outbound RTP. The failure is in **capture / sender / encode / publish**, not ICE.

**THE FINDING:** a frozen `outboundAudioLevel = 0.228949858088931` does **not** prove the capture died. It
is equally consistent with a **stalled sender** while capture stays alive (a stale stats sample).

**THE CONSEQUENCE:** our shipped fix `856104f` makes the detector call that "silent" so the **R1 self-heal**
fires — and R1 **re-acquires the microphone**. If the sender stalled, **re-acquiring the mic fixes nothing.**
The remedy would be `replaceTrack` / renegotiate / ICE restart. **T1 is now DECIDABLE.**

## Binding scope for the new plan

- **AC15 (NEW, highest value) — sender-liveness invariant.** During far-end-transcribed speech, assert
  `totalAudioEnergy` + `totalSamplesDuration` (capture) **and** `packetsSent` + `bytesSent` (sender) all
  advance. Inject capture-dead and sender-dead-with-capture-alive **independently**; prove the harness
  distinguishes them. No prior run looked at these stats. **This is the T1 discriminator.**
- **AC4 (AMENDED)** — recovery must **branch on the AC15 diagnosis**: capture-dead → re-acquire mic;
  sender-dead → `replaceTrack`/renegotiate/ICE-restart. "Detected" no longer closes AC4. The remedy must
  match the diagnosed subsystem; recovery proven by far-end transcript.
- **AC1/AC2 gain fix** — adopt an **absolute target-loudness reference** + smoothing + noise gate/floor +
  max-gain cap. **NOT the local publisher's level** (it would chase the wrong source: amplify a quiet
  remote's noise floor, or punish a good remote because the local speaker is loud).
  **`A` is same-speaker, same-path**: attenuated vs normal at the far end. **Never** vs "loudest remote."
  Record the normal-level reference pass **before** the sweep. Expect **`A ≈ r`, no boost, pre-fix**
  (2-party unity no-op). Boost in 2-party ⇒ **REFUTED**, say so loudly.
- **AC16 (NEW)** — client gathers a `relay` candidate; forced `iceTransportPolicy:'relay'` call carries
  audio end-to-end (`forceRelayDiagnosticRequested()` exists). Fragility signal, **not** the 07-08 cause.
- **AC17 (NEW)** — `>=3-party` guard so the gain fix does not regress `A = min(2.5·r, 0.88)`.
  `@vpalmisano/webrtcperf` **ADMITTED here only** (multi-party, relay load, loss/jitter).
  **BANNED as an arbiter and from any capture-path assertion** — its fake media bypasses the code under test.
- **AC18 (LOW)** — TURN-mint resilience: stub `/api/ice-config` to time out / return STUN-only; app must
  degrade **loudly**. Not a cause. Must not displace capture-path work.

**Still rejected (with reasons, D28.5):** stats-as-arbiter; Playwright UA "device emulation" (UA+viewport,
not an audio stack); Android Studio emulator (replaces the audio HAL — the prime suspect);
`@cloudflare/realtimekit-device-emulator` v0.0.2. **Device farm (BrowserStack/LambdaTest) = JROM's call,
costs money, DO NOT purchase.**

## Unchanged non-negotiables

Recording/transcript is the arbiter; stats corroborate, never decide. **INVALID ≠ PASS.** A self-declared
scaffold is an **automatic FAIL**. Bots speak on a fixed clock; the LLM is async and never gates speech.
Do not slow the ease-in ramp (fix the +3.7 dB discontinuity, target 90% in 6–8 s via `setTargetAtTime`,
fast-down/slow-up). Verifier ≠ fixer at every tier; sonnet never validates sonnet's own work. **No merge to
`main`.** Fix locally; SG confirmation-only, never iterated on. Delete only harness-created IDs — never
`652c1475`, never `TEST_ROOM01`. Do not touch client prod `139.180.129.185`. Conserve: codex55 until <1%
(JROM raised the floor from 2%), then fall open to sonnet **and say so** in the report.

## Exit (unchanged, bounded)

**DONE ⇔ (clean 3–5 min conversing call AND clean 10-min final gate) OR the 25-call budget is exhausted.**
Then STOP, report, notify, shut down `dev_machine`. 10-min gates don't burn, capped at 5. No gate waits on
JROM. Completion wording: **"ready for JROM's real-call test"** — never a bare "fixed."

## OVM

**Keep workflow 136** (JROM tracks this run there). Re-seed the tasklist to **AC1–AC18**. Keep the roster
current with `child-add`/`child-rm`. Child sessions: `x-01_<function>_<model>_meet`.

## Your first actions

1. Read the five docs above. Re-validate `topology.yaml` fail-closed (7 rules).
2. Re-seed OVM 136 → AC1–AC18.
3. Spawn the 2 co-planners (opus + codex55) → **re-plan from Phase 0.5**, folding B01–B07 in as DONE and
   sequencing the new ACs. **AC15 comes early** — it is the T1 discriminator and it re-scopes AC4.
4. Post `STATUS: PROPOSED`, structural-check, `APPROVED-PLAN`, then run the loop.
5. **Do not return to an idle prompt while any batch is unfinished.** If you must pause, write the reason
   to `callbacks.md` first. (You stalled 3× this way; /north's watcher now auto-nudges you.)
