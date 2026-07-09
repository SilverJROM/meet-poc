---
source: north
date: 2026-07-09
effort: meet-realcall-audio-fix
run: projcore-run-2026-07-09
priority: high
search_hooks: [automated fix-test loop, weak signal, gUM shim, AGC, amplification cap, ease-in, ramp, call budget, SG confirmation, dev_machine shutdown, spark bucket, codex depleted, lkvcgrok]
---

# Decisions — automated fix→test loop, team, and scope (frontload)

## D14 — Fully automated fix→test loop; nothing blocks on JROM
**JROM verbatim:** "this is a fully automated fix -> test loop i will test after its completed so dont
hold out on completion for me once done mark it done pls."
**Decision:** no gate waits on JROM. Consequence he accepted: **/north sets `T_gap`** (the dropout
threshold) from the measured gap distribution of the first two calls, rather than bringing it to him as
originally promised. The number and its justification are written here before any AC gates on it. JROM
may overrule after the fact.

## D15 — "DONE" means ready-for-real-call-test, not "fixed"
**Decision:** the completion notice says **"ready for JROM's real-call test."** Never a bare "fixed."
Both loop endpoints are desktop Chromium; the Acctg failure was an **Android capture freeze** whose
*cause* is not reproducible here (only its symptom). **`batch-01-diagnosis-2026-07-08` does NOT merge to
`main`** — project north-star §6 gates that on JROM's real cross-device call proof. JROM was told and did
not relax it.

## D16 — Error = usability, not telemetry
**JROM verbatim:** "one party cant here the other on the call, connections dropping, etc basically
useability if it recovers within a real call that is in real-time not noticiable its workable but dropped
calls, can t hear is the error im describing."
**Decision:** ERROR = cannot hear, or call drops. An imperceptible self-heal is NOT an error. Every AC is
proven from the **receive-side recording / transcript**, never from WebRTC stats alone — stats are what
lied on 07-08 (`audioLevel = 0.228949858088931` on a dead mic).

## D17 — Amplification: target, bar, and the cap question
**JROM verbatim:** "weak signals needs to be amplified by atleast 85-90% of the normal signals … an
acceptable probably is 70-75% that is a pass."
**Findings (read from code, 2026-07-09):** the amplifier **already exists** —
`remote-audio.service.ts` gives each remote peer a `GainNode` + `DynamicsCompressorNode` with
`AUTO_LEVEL_TARGET_RATIO = 0.88` (inside JROM's 85–90% band), `AUTO_LEVEL_MAX_GAIN = 2.5`,
`AUTO_LEVEL_NOISE_FLOOR = 0.003`, `AUTO_LEVEL_SMOOTHING = 0.35`, gain floored at 1 (never attenuates).
**Open question (hypothesis, NOT a conclusion):** `A = min(2.5·r, 0.88)` ⇒ `A ≥ 0.75` needs `r ≥ 0.30`.
So any peer below ~30% of the loudest **cannot** reach JROM's bar; at `r = 0.10` the ceiling is `A = 0.25`.
This is a **desk calculation from constants, not an observation.** The forced sweep (AC1) confirms or
kills it. If confirmed, raising the cap / compressor makeup gain / source normalization is **in scope**.
**This is a plausible mechanism for the original complaint** ("one of the joiner's volume is very low").

## D18 — Ease-in: the defect is discontinuity, not duration
**JROM verbatim:** "not in an instant blast" … "i can do 6-8secs easing max 10 is fine."
**Finding:** auto-level ticks inside the remote-voice watchdog every **1.5s**
(`REMOTE_VOICE_WATCHDOG_POLL_MS`), moving 35% of the delta per tick from a **unity (1.0) start**. So it
reaches 90% of target in **~9.0s** and 95% in **~10.4s** — already inside JROM's 10s ceiling, and there is
**no blast at join**. The real problem: `applyVolumeState` writes `gain.gain.value` **directly**, an
instantaneous step — the first tick is a **+3.7 dB jump in one sample** (audible click, stair-stepping).
**Decision:** fix the **ramp mechanics**, not the speed — move to an AudioParam ramp
(`setTargetAtTime`, `tau ≈ 2.5s` → 90% ≈ 5.8s, 95% ≈ 7.5s), add **fast-down / slow-up asymmetry**, keep
the compressor as a limiter backstop, and **do not double-smooth** (relax the per-tick 0.35 once the
AudioParam owns the easing). **Explicitly: do NOT "fix" this by slowing the ramp.**

## D19 — Forced weak signal via a harness-side gUM shim; INVALID ≠ PASS
**JROM verbatim:** "i need you to fully test this by forcing the audio on one participant to be weak."
**Problem:** the app requests `autoGainControl: { ideal: true }` (`mic-energy.ts:52`). Attenuating the
source may be **re-normalized by Chrome's AGC** before publish — the weak signal never reaches the system
under test, everything goes green, and we prove nothing.
**Decision:** two modes.
- **Forced (deterministic):** a page-level `getUserMedia` shim (Playwright `addInitScript`) routes the
  captured stream through a `GainNode` **downstream of Chrome's audio processing** and hands the app the
  attenuated track. The app publishes it unaware (`media.service.ts:55` is the single gUM chokepoint;
  `sfu-client` publishes the resulting track). AGC cannot claw it back. **No app change required.**
- **Faithful (realistic):** attenuate at dev_machine's PipeWire virtual mic, *before* capture, AGC ON —
  the true soft-talker scenario.
**Hard rule:** the stimulus is **verified** before any assertion. If AGC ate the attenuation, the result
is **INVALID, not PASS.** A third verdict, and it must exist in the code.
**Note:** AGC was ON during the real call and the joiner was still inaudible — so faithful mode is the
faithful reproduction; forced mode isolates the app's own amplifier.

## D20 — Bounded, satisfiable exit (the fix for the last run's 9-hour circle)
**Decision:** DONE ⇔ (clean 3–5 min call **AND** clean 10-min gate) **OR** 25-call budget exhausted →
STOP, report, notify, shut down dev_machine. **25** 3–5 min calls burn (including harness-caused aborts);
**10-min gates do not burn** but are capped at **5** so they cannot be an escape hatch.
**Root cause of the prior circle (D13):** an exit condition requiring an empty queue while 5 ACs were
real-call gates projcore could not perform. Never again — human-owned ACs are out of the queue.

## D21 — Test topology and machine roles
- **Loop:** `.140` (this host) ↔ `.123` (dev_machine), both conversing, local llama brain + whisper STT +
  piper TTS. **Fix locally, always.**
- **SG (`silverjrom.com`):** confirmation-only, added only when we already expect success. **Chromium
  only** — 1 vCPU / 954 MB / nginx resident cannot host a brain (Qwen-1.5B alone is a 940 MB model) and
  will not reliably run whisper. It **plays a WAV** and does **not** listen; `.140`/`.123` transcribe what
  arrives. Chrome's fake-audio input accepts **WAV only** → JROM's `.mov`/`.mp3` is transcoded.
  **SG is never iterated on.**
- **`dev_machine` is shut down when done / not in use** (JROM standing ops rule, AC14).
- **Peer2's machine: OFFLINE** — last heartbeat 2026-07-04 23:09 UTC. Verified via `listAiMessages` →
  `"Desktop not connected"`. (`listDesktopNodes.status` and `sendRelayChatMessage.success` **both lie**.)
- **Client prod server (`139.180.129.185`): OUT OF SCOPE**, JROM's explicit call. It runs nginx,
  PostgreSQL 17 and four live client apps (jayu, miapage, primebeta) on 2 vCPU. Do not touch.

## D22 — Android: answered, and skipped
**JROM asked:** can we simulate the Android/phone call on our machines?
**Answer:** *Yes, but it would not reproduce this bug.* `.140` has `/dev/kvm` + 16 cores, so a real
Android 10 x86_64 emulator running Chrome, fed via the emulator mic and driven by `adb` + Playwright, is
buildable. But the frozen-capture signature lives in the device **audio HAL / vendor AEC**, which the
emulator replaces with a virtual goldfish audio device. Authentic Android Chrome on **fake audio hardware**
— and the hardware is the prime suspect. **Skipped.**
**The real path:** JROM's **Android tablet** is drivable over `adb` (real audio stack, real bug surface),
costing him one cable and one `adb tcpip 5555`. Recommended when he has a moment. We can simulate Mode A's
**symptom** (constant-level track), never its **cause**. **T1 stays OPEN.**

## D23 — Team roster (JROM-routed) + quota reality
**JROM verbatim:** "on implem L1= have spark/composer alternate i want to check who is better with them,
L2=haiku, L3=sonnet, validator= L1/2 codex55 (backup sonnet) L3=opus."
**Decision:** stamped in `topology.yaml`. Coordinator **grok-4.5** in tmux session **`lkvcgrok`** (JROM:
OVM recognizes that name; it intentionally breaks the reserved `x-` prefix — child sessions still comply).
**Measured usage (`agent-usage.sh`, 2026-07-09):**
- claude HEALTHY (5h 23%, weekly 11%, $5000 extra-credits at 4%) → opus/sonnet/haiku carry the load.
- **codex55 DEPLETED-ADJACENT: `shared_weekly = 96%`, ~4% headroom.** Validator L1/L2 **falls open to
  sonnet** when exhausted; the run continues (JROM: "dont hold out on completion"). Cross-provider
  independence is lost on fallback — the validation report must **say so**, never silently.
- **`grok-build` NO LONGER EXISTS** in CLI 0.2.93 (only grok-4.5, grok-composer-2.5-fast, glm5.2). Every
  grokbuild seat in the 07-08 stamp is dead.
- **Gateway bug (JROM corrected /north):** `agent-usage.sh` reports `spark: depleted` by deriving its
  headroom from codex `shared_weekly` (96%). **Spark draws its own bucket** (`spark_weekly = 8%` → ~92%
  headroom). `rungs.spark` is WRONG; read `raw.codex.spark_*`. Fix the gateway later.
- **L1 is an A/B alternation** (spark ↔ grokcompose) at JROM's request to compare them. Per-task model +
  outcome recorded in `progress.md`. If spark's bucket empties, the comparison is **truncated** and must
  be reported as such — never presented as a verdict.

## D24 — `planning_criticality: high`, not `critical` (resource conservation)
**JROM verbatim:** "we need to conserve resources when we can."
**Decision:** /north downgraded planning criticality from `critical` (the 07-08 stamp) to **`high`**. The
plan is already tightly specified by JROM's frontload; a 4-model planning-stage panel is not the best
spend. Co-planners deliberate; the deliberation panel is engaged **per-batch on the capture-path batches
only**. Red-team defaults to **budget**; `elite` only after a fix has failed twice.
**Tension acknowledged:** the 07-08 run's substantive failure (D12) was *skipping* deliberation. The
mitigation is that deliberation is preserved exactly where the risk lives (the capture path: gUM shim,
AudioParam ramp, mic-energy), and dropped where JROM has already made the calls. **JROM may overrule.**

## D25 — The harness must not manufacture the failures it hunts
**Decision:** bots speak on a **fixed clock** from **pre-generated audio**; the LLM runs **async** and
never gates speech. If a slow brain decides when to talk, its silence is indistinguishable from a dead
mic and we would burn calls chasing our own latency. Measured `llama-cli` throughput is still **unknown**
(the benchmark hung and was killed) — another reason the brain must never be in the audio critical path.

## D26 — Diagnostics hygiene with a hard guardrail
**JROM verbatim:** "each test log the findings and delete the diagnostics (just the one you generated on
the test) and circle back."
**Decision:** delete **only** sessions/rooms the harness created, matched by IDs **captured at creation**.
**Never** session `652c1475` (the 07-08 real call — the only real evidence of the actual bug). **Never**
room `TEST_ROOM01` (`testroom01001`). **No wildcard sweeps.**
