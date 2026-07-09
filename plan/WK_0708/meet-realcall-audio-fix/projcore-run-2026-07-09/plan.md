# Atomic Plan — meet-realcall-audio-fix projcore-run-2026-07-09

## Custody Notes

- Planning deliberation panel: **NOT convened** (north NO; D24 conserve). Per-batch deliberation only on capture-path.

- Branch: `batch-01-diagnosis-2026-07-08`; no merge to `main`.
- Exit: `(AC8 clean 3-5 min call AND AC9 clean 10-min gate) OR 25-call budget exhausted`, then stop, report "ready for JROM's real-call test", and shut down `dev_machine`.
- Arbiter: receive-side recording and transcript. WebRTC stats corroborate only; they never decide PASS.
- Verdicts: `PASS`, `FAIL`, `INVALID`. Unverified weak stimulus is `INVALID`, never `PASS`.
- Harness rule: bots speak on a fixed clock from pre-generated audio; LLM brain runs async and never gates speech.
- Protected evidence: never delete session `652c1475`, room `TEST_ROOM01`, or `testroom01001`; no wildcard sweeps.
- Verifier != fixer: if `impl_tier: L3` uses sonnet, validation is `validator_tier: L3` opus. If codex55 L1/L2 quota exhausts, fall open to sonnet only when sonnet did not implement that batch, and log the independence loss.
- Capture-path rows are stamped exactly as required: `impl_tier: L3`, `deliberation: yes`, `redteam: standard`.
- Peer co-planner finding folded in: `computeRemoteAutoGains` currently normalizes against the loudest
  remote publisher. In the 2-party `.140` <-> `.123` loop there is only one remote publisher, so the
  "loudest" can equal the quiet sample and produce unity gain. Also, peers below
  `AUTO_LEVEL_NOISE_FLOOR = 0.003` can fall out of the usable set. The sweep must prove or refute these
  mechanisms from recordings.


## BINDING CORRECTIONS (north plan approval 2026-07-09 — mandatory)

1. **Definition of A (non-degenerate):**  
   `A = loudness(quiet speaker @ far end) / loudness(SAME speaker at normal level @ same far end, same path)`  
   Voiced segments only (RMS/LUFS). Record normal-level reference pass **before** any attenuated sweep.  
   Do **not** measure A against the app's internal "loudest remote" (degenerate in 2-party).

2. **B08 headline:** Report 2-party unity/no-op as the **headline** finding with gain-trace evidence.  
   Pre-fix expectation: **A ≈ r** at every valid sweep point (no boost). If boost is observed, that **refutes** the finding — document loudly.

3. **B09 reference:** Use absolute target loudness **or** local publisher level — **not** "loudest remote".  
   Add a ≥3-party guard test so the fix does not regress multi-party. Compressor = limiter backstop only, never proof of A.

## Budget Tracking

- Batch B01 creates the call ledger before any browser call starts.
- Burn one of 25 for every 3-5 minute call attempt, including harness-caused aborts.
- Do not burn 10-minute gates, but cap them at 5.
- Every batch that starts a browser call must append: call id, created room/session ids, duration, verdict, burn count, gate count, recording path, transcript path, cleanup status.

## Batches

| id | title | scope (files/mechanism) | acceptance / proof | est_min | impl_tier | validator_tier | deliberation | redteam | depends_on |
|---|---|---|---|---:|---|---|---|---|---|
| B01 | Call-budget ledger and cleanup guardrails | Add the run-owned budget ledger, created-ID registry, and delete guard so harness cleanup can only touch ids captured by this run. Hard-block protected ids `652c1475`, `TEST_ROOM01`, `testroom01001`; no wildcard deletion. | Dry-run proves protected ids cannot be deleted and uncaptured ids are rejected. No AC closes yet; this is the safety prerequisite for AC12/AC13. | 20 | L2 | L2 | no | yes (budget) | none |
| B02 | Recording/transcript arbiter and third verdict | Build the shared evidence contract for receive-side recordings, voiced-segment RMS/LUFS, transcript extraction, and `PASS/FAIL/INVALID` result writing. Stats fields may be logged but not decisive. | A synthetic known WAV round-trip produces a recording, transcript, RMS/LUFS summary, and an `INVALID` sample result when stimulus verification is missing. Supports AC1-AC11. | 25 | L2 | L2 | no | yes (budget) | B01 |
| B03 | Fixed-clock conversation harness | Pre-generate piper speech assets; schedule both bots on a fixed clock; run llama/LLM replies asynchronously so brain latency never creates silence. | Local harness run records both sides speaking fixed utterances; transcript proves expected words were emitted even if async brain response is late. Supports AC8/AC9. | 25 | L2 | L2 | no | yes (budget) | B02 |
| B04 | Baseline two-call `T_gap` derivation | Run the first two instrumented 3-5 minute `.140` <-> `.123` calls, compute audible-gap distribution from recordings/transcripts, and write the `T_gap` decision entry before any recovery AC gates on it. | Decision file records `T_gap`, histogram/source recording paths, call burn count `2/25`, and rationale. Recording/transcript, not stats, drives the value. | 25 | L2 | L2 | no | yes (budget) | B03 |
| B05 | Forced weak-signal gUM shim and stimulus verifier | Capture-path: Playwright `addInitScript` shims `getUserMedia`, routes the captured mic through a downstream `GainNode`, and exposes intended `r` plus measured stimulus verification. Does not change app code unless harness structure requires it. | For `r=0.50` and one invalid control, receive-side proof shows stimulus within +/-20% or returns `INVALID`; no amplification pass is claimed yet. | 25 | L3 | L3 | yes | yes (standard) | B02 |
| B06 | Faithful PipeWire weak-source mode | Add dev_machine source attenuation path before Chrome capture with AGC left ON, preserving the real soft-talker scenario distinct from forced shim mode. | One attenuated source run records the actual received attenuation and logs AGC compensation amount. Result may be finding/pass/fail but never substitutes for forced mode. | 25 | L2 | L2 | no | yes (budget) | B02 |
| B07 | Mode-A/Mode-B capture injection contracts | Capture-path: add frozen non-zero, zero-level silent-track, and post-recovery speech stimuli around `mic-energy` / media diagnostics so recovery can be proven by transcript, not detector state alone. | Harness can create Mode A and Mode B signatures and then inject known speech; far-end transcript is the required recovery proof for AC4/AC5. | 25 | L3 | L3 | yes | yes (standard) | B02 |
| B08 | Forced weak-signal sweep baseline | Run AC1 sweep at `r=0.50,0.30,0.20,0.10,0.05` before amplifier changes. Use B05 verifier first; invalid points are `INVALID`. HEADLINE: 2-party unity/no-op with gain-trace evidence (expect A≈r pre-fix; boost=REFUTE). Also classify noise-floor dropout / max-gain ceiling. A uses same-speaker normal-vs-attenuated far-end loudness (binding A def), not loudest-remote. | For each valid point, recording-derived achieved ratio `A` is reported. If `A<0.70`, the failed points and observed mechanism become the fix contract for B09. | 25 | L2 | L2 | no | no | B05 |
| B09 | Remote auto-level 2-party reference / noise-floor fix | Capture-path: if B08 confirms 2-party unity/no-op, noise-floor dropout, max-gain ceiling, or another source-normalization gap, adjust `remote-audio.service.ts` to a NON-DEGENERATE reference (absolute target loudness or local publisher level — never loudest-remote) so quiet peers reach `A>=0.70` in 2-party without clipping/blast; add ≥3-party guard test; compressor stays limiter backstop only. Skip only if B08 refutes. | Re-run failed B08 points; receive-side recording shows valid stimulus and `A>=0.70` for every valid point. The mechanism note states which hypothesis was fixed or refuted; limiter/compressor remains a backstop, not the proof. | 25 | L3 | L3 | yes | yes (standard) | B08 |
| B10 | AudioParam ramp and asymmetric release | Capture-path: change `remote-audio.service.ts` `applyVolumeState` from direct `gain.gain.value` jumps to AudioParam easing, with slow-up/fast-down behavior. Do not slow the ramp; remove double-smoothing if AudioParam owns easing. | Instrumented recording/gain trace proves 90% target in 6-8s, <=10s max, monotonic up, no single step above ~1-2 dB, and fast fall when speaker becomes loud. | 25 | L3 | L3 | yes | yes (standard) | B09 |
| B11 | Full forced weak-signal acceptance gate | Re-run AC1 full sweep after B09/B10, including verifier and recording analysis. | AC1 closes only when every valid `r` point has verified stimulus and recording-derived `A>=0.70`; invalid points are reported as `INVALID`, not pass. | 25 | L2 | L2 | no | no | B10 |
| B12 | Faithful weak-mode acceptance gate | Run AC2 using PipeWire source attenuation with Chrome AGC ON. | Recording/transcript proof shows achieved loudness `A>=0.70`, or logs AGC compensation/failure as a finding. This does not override AC1. | 20 | L2 | L2 | no | no | B11 |
| B13 | Mode A frozen non-zero recovery fix/gate | Capture-path: validate existing `856104f` detector and, only if recovery fails, fix the R1 self-heal path so frozen non-zero/no-speech recovers to audible speech. | AC4 closes only when `(a)` classifier marks frozen non-zero as silent and `(b)` far-end transcript contains post-recovery known words. | 25 | L3 | L3 | yes | yes (standard) | B07 |
| B14 | Mode B dead-mic zero recovery fix/gate | Exercise silent track / `micSilent=1` / level 0 recovery path and fix only the narrow recovery break if transcript proof fails. | AC5 closes when detection fires and far-end transcript proves recovered speech within `T_gap`. Failure produces a precise correction contract. | 25 | L2 | L2 | no | yes (budget) | B07, B04 |
| B15 | Network degradation and true-drop reporting | Use `tc netem` on dev_machine for packet loss, jitter, latency, and one hard interface drop. Keep app code changes scoped to recovery/reporting if the gate fails. | AC6 closes when recordings/transcripts show survival or recovery within `T_gap`; a genuine over-`T_gap` drop is reported as a drop. | 25 | L2 | L2 | no | yes (budget) | B04, B03 |
| B16 | Track-ended, publish-failure, rejoin storm | Inject track-ended, publish failure, and repeated rejoin scenarios without deleting protected historical data. Fix only permanent one-way or unrecovered publish state. | AC7 closes when far-end transcript proves audio returns after each injected failure and no permanent one-way state remains. | 25 | L2 | L2 | no | yes (budget) | B04, B07 |
| B17 | Media regression gate | Verify screen share both ways, video both ways, and quiet-voice remedy still holds after fixes. | AC10 closes with browser evidence for share/video plus recording-derived quiet-voice proof from B11/B12. | 25 | L2 | L2 | no | yes (budget) | B11, B12, B15, B16 |
| B18 | Clean 3-5 minute conversing call | Run the bounded `.140` <-> `.123` real-time harness with both sides using local llama/whisper/piper and fixed-clock speech. Burn one call attempt. | AC8 closes when both receive-side recordings/transcripts show continuous bidirectional conversation for 3-5 minutes with zero ERRORs per `T_gap`. | 25 | L2 | L3 | no | no | B13, B14, B15, B16, B17 |
| B19 | Clean 10-minute final gate | Run the sustained 10-minute `.140` <-> `.123` gate. Does not burn the 25-call budget; counts against max 5 gates. | AC9 closes when both receive-side recordings/transcripts show 10 minutes with zero ERRORs. On fail, return to the narrow failing batch; do not keep looping gates past 5. | 25 | L2 | L3 | no | no | B18 |
| B20 | SG confirmation-only leg | Add `silverjrom.com` Chromium-only participant playing a pre-supplied WAV. SG does not listen/transcribe and is never iterated on; local endpoints remain the fix surface. | AC11 closes when `.140`/`.123` recordings/transcripts prove SG WAV audio arrives, and SG reports only connection/outbound signals. Any failure routes back to local batches first. | 20 | L2 | L2 | no | no | B19 |
| B21 | Final cleanup, report, and dev_machine shutdown | Delete only run-created rooms/sessions from the ledger, write final report with call/gate budget and all AC verdicts, notify completion as "ready for JROM's real-call test", and shut down dev_machine. | AC12/AC13 close from cleanup ledger proof. AC14 closes from graceful shutdown command/result. Report stops whether success gate passed or 25-call budget exhausted. | 15 | L2 | L2 | no | no | B19 or budget exhausted |

## Conditional Routing Rules

- If B08 refutes the 2-party unity/no-op, noise-floor, and gain-cap hypotheses, mark B09 skipped with evidence and go directly to B10.
- If any capture-path fix fails validation twice, upgrade the next red-team from `standard` to `elite`; otherwise never use elite by default.
- If AC8 or AC9 fails, do not create a vague "retry call" batch. Route back to the specific failing mechanism: weak voice (B09-B12), Mode A/B recovery (B13/B14), network (B15), track/rejoin (B16), or harness defect (B01-B04).
- If the 25-call budget exhausts before AC8+AC9 are both clean, stop after B21 with the failure report and shutdown; do not wait on JROM.
