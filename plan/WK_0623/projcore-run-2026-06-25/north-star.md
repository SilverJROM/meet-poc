# North Star — Recording reliability v2 + drop diagnosis (2026-06-25)

JROM verbatim answers (frozen; append-only).

## Decision 1 — Recording persistence approach (R1/R2)
> "ok just do it in the background, when i close it persist if needed to confirm upload"

**Applied as:** upload runs in background; on close, persist a pending marker and confirm/retry the upload so it survives teardown. Pair with the backend grace-window so a late upload for a just-closed session is still accepted. Grace window = **5 min** (projcore default, covers a slow long-call upload).

## Decision 2 — Call drop (R4)
> "if its here internet then its a non-issue, unless we can prove that there is nothing on our app that caused it"

**Applied as:** diagnose first. Client-side internet → document as non-issue with proof, NO code fix. Only fix if evidence shows our app caused/worsened the drop. Burden of proof: rule our app in or out from `meeting_session_diagnostics` + logs.

## Roster override (JROM, this run) — supersedes §1.14 standard
> "reduce opus/claude tokens to 5% ... lean very heavily on codex55 and grok ... if you still need some claude work lean on sonnet 5-15%"

- **Coordinator:** Opus (projcore) — **≤5%**, coordination only, no direct implementation/source-reading.
- **Implementer A (backend + drop diagnosis):** codex55 (gpt-5.5) — session `lkvc-codex55`.
- **Implementer B (frontend build/deploy + tests):** grok composer — session `03_impl_grokcompose_lkvc`; grok build = backup.
- **Independent validator (verifier ≠ fixer):** sonnet — session `03_validator_sonnet_lkvc` — **5–15%**.
- Supersession of §1.14 (standard validator=codex55) logged: validator=sonnet per JROM token directive. codex55 is an IMPLEMENTER here, so validator must differ → sonnet.

## Standing
- Lifecycle: **pre-live** (deferral OFF).
- Scope: LOCAL + deploy the served FE bundle (JROM-authorized this run).
- Acceptance: real long-call (Peer2 relay), per real-call-acceptance rule. UI-proof for user-visible R1/R2/R3.
- Reproduce-first (§1.4h): R1/R2/R3 are issues → sonnet reproduces broken on old build BEFORE fixer works.
- Owner-match (403) gate is a security boundary — must NOT be weakened (trust-defaults ALWAYS-ESCALATE). Grace-window relaxes only the session-open (409) check.
- Never touch TEST_ROOM01 (`testroom01001`) / AGENTROOM destructively; clean up validator-created rooms before DONE.
