# North-star — projcore-run-2026-06-08 (host-inaudible-remote-audio)

Append-only. Original entries locked mid-run (only JROM amends).

## JROM directives (verbatim, 2026-06-08)
- "deliberate 10x max until (3x no issues are found) either 3x issue not found or max 15x (revised). and fix the app invoke the full 4agetns on deliberation."
- "can you add gpt 5.4 as well on this deliberation and haiku as well to maximize chances of succeeding"
- "we only have 1 environment and its live right now on the app hosted on my machine"
- Scope: "Playout + the 1-publisher-at-a-time anomaly" (+ diagnostics).

## Locked decisions
1. **Goal:** host hears every remote participant's audio on a real cross-platform/intl call. Contract = `og-requirements.md` R1–R3.
2. **Deliberation = 6-agent panel** (extends the standard 4): Opus(inline) + Codex 5.5(gpt-5.5) + GPT-5.4 + Spark(gpt-5.3-codex-spark) + Sonnet(4-6) + Haiku(4-5). All 6 confirmed locally available.
3. **Loop bound (JROM-revised 2026-06-08, 15→30):** run the deliberation/find-verify/red-team loop **up to 30 rounds**; **earliest possible exit = 3 CONSECUTIVE red-team rounds that find nothing new.** Otherwise run the FULL 30. Rationale (JROM): "we keep seeing issues" + the prior FIX1-5 full deliberation shipped and STILL failed → bar is higher, do NOT rush. Each round = all 6 agents independently hunt holes; vary attack angle each round.
4. **Consensus:** every finding any panelist raises is captured + triaged. Final root-cause/fix convergence settles on the strongest models (Opus + Codex 5.5) per `projcore-deliberation.md §4b`; Spark/Haiku/Sonnet dissent recorded, non-blocking at settle. Haiku included as an ADDITIVE audit voice only (JROM's "never Haiku" rule is about implementer/production work, not panel audit — JROM explicitly requested it here).
5. **Single live env = app hosted on JROM's machine.** "Validate" = rebuild the running app; JROM places a real US↔PH call to confirm. No separate DEV/QA deploy. Real-device confirmation is mandatory (fake-media masks playout — 2026-06-04 lesson).
6. **Verifier ≠ fixer.** Panelists audit + decide approach; a separate implementer writes the fix; projcore validates independently.
7. **Lifecycle = pre-live, deferral OFF.** No TODO/follow-up-PR punts; any deferred work needs a queue.md row landing this run.
8. **Topology:** 3-agent (implementer ≠ validator ≠ coordinator) for the FIX phase given audio is the core broken capability and prior fixes regressed.

## Effort Policy (source: projcore, derived 2026-06-08)
- Posture A (quality-dominant): this is a recurring, user-blocking, hard-to-reproduce real-device audio failure. High reasoning throughout.
- Panel: each external panelist runs its CLI at high effort. Coordinator (Opus) NOT /fast during deliberation + FAIL diagnosis.
- Implementer (fix phase): medium tier minimum; high for the playout/subscribe mechanism slice.

## Injected directive — 2026-06-08 (JROM, verbatim)
> "what is this 1 talker at a time, have the user settle it themselves and lets not enforce this on the app, everyone can talk if they want to and the app should not suppress the voice of the others"

**Scope lock (binds R2 panel, consensus, and the fix):**
1. The app MUST NOT contain any logic that limits/suppresses who can be heard — no push-to-talk enforcement, no active-speaker-only audio gating, no "loudest wins". Turn-taking is SOCIAL/user-managed, never app-enforced.
2. The host MUST hear ALL concurrent remote publishers, mixed — R2 is a hard requirement, not a nice-to-have.
3. "Anomaly B" is reframed accordingly: it is NOT a feature to remove — it was a worry the app might be DROPPING concurrent audio. The fix must ensure every concurrent publisher stays audible (incl. the latent mid-overwrite guard so the app never silently evicts a publisher). Do NOT add any talker-limiting.
4. Verified 2026-06-08: `syncPeers` already mixes all non-local peers; `ActiveSpeakerService` is UI-highlight-only (silent analyser) — no audio suppression exists today. The fix must preserve this.

## Injected directive — 2026-06-08 (JROM): rotating-lens code red-team
> "the next consecutive iterations the agents are prompted to look at this at a different ways or angles to spot any missing issues hiding"

LOCKED: each consecutive CODE-REDTEAM round MUST attack a DISTINCT surface/lens. A round counts toward the 3-consecutive-clean streak ONLY if it (a) used a NEW angle not used in a prior round AND (b) found nothing. Three clean = three DIFFERENT break-attempts, never the same review repeated. Lens rotation (assign a fresh one each round; do not repeat):
- L1 structural/correctness sweep (CR1)
- L2 fix-verification + false-positive / silence edge (CR2)
- L3 re-verify + remaining structural (CR3)
- L4 concurrency/async races + leaks + real-world scenario trace (CR4)
- L5 adversarial inputs + browser-quirk paths (iOS Safari/Firefox no-setSinkId, NaN/negative/huge RTCStats, autoplay variants) + error-path coverage (CR5)
- L6 spec-vs-code divergence + observability: trace each R1/R2/R3 requirement to code+test; does diagnostics capture enough to debug the NEXT failure? (CR6 if needed)
- L7+ : new lenses as needed (state-machine exhaustiveness, RBAC/security of diagnostics payload, perf under N publishers).
Projcore assigns the lens in each CR packet; if a round reuses a prior lens, it does NOT count toward the streak.

## Injected directive — 2026-06-08 (JROM): CRITICAL-only resets the code-redteam counter
> "keep driving to 3-clean but raise the standard on what resets the counter non-critical/cosmetic changes does not trigger it ... the most critical is all user/parties are able to talk/record/and see each other others are non-critical. non-critical get fixed if seen but does not reset counter"

LOCKED gate: a CODE-REDTEAM round is "critical-clean" iff it surfaces NO CRITICAL finding. Streak = consecutive critical-clean rounds (distinct lenses). 3 → gate passes.
- CRITICAL (resets counter): anything that BREAKS or threatens — all parties can TALK (hear + be heard), RECORD, and SEE each other (video). I.e. a real path to: a participant inaudible/unheard, recording missing/broken audio-video, video not received, or a publisher suppressed/stranded.
- NON-CRITICAL (does NOT reset; still fixed if seen): cosmetic/UI, banner/observability accuracy, diagnostics, test-coverage gaps, security-hardening that doesn't break the call, perf nits, dead code.
Re-score: CR11 clean + CR12 (test gaps = non-critical) → critical-clean both → STREAK 2/3.
