---
date: 2026-05-30
project: meet-poc
type: security-boundary-decision
source: jrom (escalated by projcore)
priority: high
search_hooks: [isAdmittedDiagnosticPoster, diagnostics-gate, reconnect-drop, clientKey, R6]
---

# Diagnostics admittance gate relaxation — JROM APPROVED

**Finding (B4 PROPOSED):** isAdmittedDiagnosticPoster's durable-identity path (signaling/index.ts:511-519, keyed by clientKey+participantId+wasAdmitted) is gated behind `!poster.clientId`. The live client ALWAYS sends clientId, so after a peer expires from admitted+reconnecting maps and re-posts with a stale clientId before re-admit, path-3 is defeated → 403 → diagnostics DROPPED — exactly the flaky-reconnect guests we most want to diagnose.

**Decision (JROM, escalated per trust-defaults ALWAYS-ESCALATE on auth/security boundaries):** RELAX — accept the durable identity (clientKey+participantId+wasAdmitted match) even with a stale clientId present, UNLESS a different LIVE admitted peer owns that clientId. Security-neutral: clientKey is the unforgeable 128-char anchor; the `!clientId` guard adds no real protection (an attacker would simply omit clientId to reach path-3). 

**Why escalated not autonomous:** touches the access-control predicate for who may write diagnostics for a session. projcore does not decide auth/security boundaries alone even under the NS9 "go ham" greenlight (that covered audio aggressiveness, not auth). JROM ruled via AskUserQuestion.

**Implementation:** folded into B4a at its gate boundary (was deferred while the decision was pending). Keep the "different live admitted peer owns clientId → reject" safety. Repro test: 403 today → 200 after.
