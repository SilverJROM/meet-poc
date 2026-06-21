---
date: 2026-05-31
project: meet-poc
type: docbuild-review
source: projcore
---
# Agent-refactor doc-build — projcore review: APPROVED (0 revisions)

Worker: codex gpt-5.5 (lkvc-codex55-doc, TUI/bypass). Hardened envelope honored (TUI + watcher + failsafe poller).

**project_specs.md** — scope clean: only §14 (new), §10 Open Questions (Q-PS-6/7/8 appended — drift notes, NOT auto-fixes per read-only-§1-12 constraint), §12 changelog line. Cross-checked §14 per-agent commands vs §8/§9 ground truth: DEV URL, ports (4700 proxy/4720 be/4711 fe/4710 e2e), vitest+Playwright, projcore_session=lkvc, deploy=build+pm2 restart, migration=db.ts+numbered SQL, module list — all accurate.

**webrtc-coturn-node.md** (~/.codex/skills/sysarch/references/stacks/, NEW, ~13KB) — spot-checked 5 landmine claims, all correct (fake-media flags, getUserMedia secure-context, TURN creds same-RTCIceServer-entry [=the SB1 bug], perfect-negotiation rollback, coturn external-ip NAT). Captures real meet-poc landmines incl. several hit this session (mid-reconcile-after-SRD, "visible tile hides one-way audio", app-owned synthetic energy for mic-liveness).

**One TBD (escalated to JROM, not guessed):** CF TURN endpoint — repo uses /v1/turn/keys/<id>/credentials/generate; CF docs show /credentials/generate-ice-servers. PROJCORE NOTE: /credentials/generate was confirmed LIVE+WORKING on 2026-05-29 (SFU run — CF returned valid iceServers). So not broken; "which is canonical" doc question only. Codex's guidance (verify before changing, keep static TURN fallback) is sound.

**Minor verify-later (non-blocking):** §14 references `window.__meetDebug.sfuPublishState` + `npm test -w e2e/-w backend` workspace scripts — plausible + repo-derived; spot-verify on first use.

Verdict: APPROVE. No revision rounds.
