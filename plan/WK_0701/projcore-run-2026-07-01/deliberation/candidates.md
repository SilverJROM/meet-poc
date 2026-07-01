# Deliberation Candidates (front gate — audits the APPROACH) — WK_0701

Frozen at Phase 0 (JROM pre-approved the [DELIB]/[REDTEAM] finalization happens in the B0
co-planner session). Panel: Opus (projcore inline) + codex55 co-planner (+ Sonnet + Spark
if escalated to full 4-agent). Codex55 is the cross-runtime co-planner seat.

- **B0 — Recovery-ladder strategy** [approved]
  Topic: retry-only vs forced renegotiation vs full SFU rejoin vs hybrid escalation ladder.
  Anchor: north-star decision #1 (escalate, never terminal give-up). Must settle: exact
  escalation order, when to spin a fresh cfSessionId, bounded-ness, retry-storm avoidance,
  and disposition of the prior-art `resubscribe` WIP.

- **B2 — Cap → rejoin mechanism** [approved]
  Topic: the concrete mechanism replacing the permanent-stop cap. When exactly to escalate
  to full rejoin; how to avoid duplicate subscriptions / ghost streams / retry storms during
  the transition; how the fresh-cfSessionId rejoin re-establishes all subscriptions cleanly.
  Baked into B2's PROPOSED as the agreed approach.

Mid-run §1.4b injections may append candidates.
