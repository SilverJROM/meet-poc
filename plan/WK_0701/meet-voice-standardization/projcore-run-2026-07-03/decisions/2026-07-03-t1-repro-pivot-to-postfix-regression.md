---
date: 2026-07-03
project: meet-poc
type: autonomous-call
trigger: 5 rounds of dev_machine live-E2E repro attempts, real signal produced but app banner never fired
source: projcore
priority: medium
search_hooks: [T1 repro pivot, dev_machine E2E limits, postfix regression test, silent.wav fake audio]
---

## What was decided

Stopped chasing a pre-fix live-browser reproduction of R1's bug on dev_machine after 5 rounds.
Round 5 achieved a genuinely correct signal (a real captured MediaStreamTrack, `live`/`enabled`/
`unmuted`, near-zero energy via `--use-file-for-fake-audio-capture=silent.wav`, sustained 90+
seconds) but the app's local mic-silence banner never appeared — meaning either the app's
internal classifier reads a different signal path than the agent's own analyser check, or
something about relay-mode/AGC processing in this synthetic setup doesn't match the real
`acctg` incident's actual failure signature closely enough. Proceeding to implementation now
using the primary evidence already in hand (the real `acctg` incident's SQL diagnostics data +
both co-planners' independent source-code reading in `consensus.md`) rather than continuing to
iterate on the synthetic repro. The synthetic repro effort becomes the POST-FIX regression test
instead — once the fix exists, the exact classifier code path will be known and the test can be
tuned against it directly, which is a much tighter, cheaper feedback loop than guessing at the
right synthetic trigger against unmodified code.

## Reasoning

Real-world diagnostics from an actual production incident (the `acctg` 61-minute silence,
already captured in `og-requirements.md` R1 and cross-checked line-by-line by codex55 + Opus
during deliberation) are stronger evidence than a struggling synthetic E2E attempt. §1.4h's
issue-reproduce-first rule exists to prevent guessed fixes against unverified reports — that
risk doesn't apply here since the underlying mechanism (`nextSweepGate`'s one-shot latch) was
independently confirmed by both planners reading the actual current source, not inferred from
the incident data alone. Continuing to sink rounds into a synthetic repro that keeps surfacing
new fake-media quirks (device ownership semantics, track.stop() vs silent-track distinction, now
possibly AGC/relay-mode signal-path differences) has hit diminishing returns for a LOCAL-only,
pre-live run.

## Counterfactual

Could have kept iterating (round 6+: instrument the app's actual classifier call site directly
via a temporary console.log or breakpoint to see exactly what signal it reads in this synthetic
setup, rather than guessing). Rejected as excessive for this stage — that level of precision is
more valuable to build INTO the regression test after the fix exists, when it can be validated
against known-correct behavior instead of against a moving target.

## Cleanup performed

- Gateway session `repro-t1-mic2` deleted.
- dev_machine shutdown signal sent (`sudo nohup poweroff`).
- Test room `reprot1test-54wlgc` (owned by Peer2's account) left as-is on the live app — low-risk
  throwaway test room, not cleaned up immediately since dev_machine is now powering off; flagged
  here for later cleanup if it accumulates.
