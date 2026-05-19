# queue.md — meet-poc rebuild

**Run start:** 2026-05-19
**Pattern:** 2 (supervisor-across-tmux)
**Implementer:** Codex (`$lead`) in tmux session `lkvcdx-39`
**Coordinator:** Claude `/projcore`
**Plan:** `../implementation-plan.md`
**Contract:** `../og-requirements.md`
**Scenarios:** `../scenarios.md`
**Spec:** `../../../project_specs.md`

| Batch | Title | Req# | Scenarios | Status | Branch |
|-------|-------|------|-----------|--------|--------|
| B0 | Contract lock (projcore) | — | (writes the rest) | IN PROGRESS | — |
| B1 | Backend foundation | R1.1-R1.7, R8.1-R8.2, R10.2 | S1.1-S1.7 | PENDING | feat/meet-rebuild-b1-backend-foundation |
| B2 | Rooms API + signaling | R2.1-R2.5, R3.1-R3.8 | S2.1-S2.12 | PENDING | feat/meet-rebuild-b2-rooms-signaling |
| B3 | Angular shell + auth + dashboard | R4.1-R4.5, R4.8, R8.1 | S3.1-S3.8 | PENDING | feat/meet-rebuild-b3-angular-shell |
| B4 | Call UI + WebRTC client | R4.6, R4.7, R5.1-R5.5 | S4.1-S4.8 | PENDING | feat/meet-rebuild-b4-call-ui |
| B5 | Recording (client-mix + upload) | R6.1-R6.4 | S5.1-S5.3 | PENDING | feat/meet-rebuild-b5-recording |
| B6 | coturn + cutover | R7.1-R7.3, R8.3-R8.4, R10.1, R10.3 | S6.1-S6.6 | PENDING | feat/meet-rebuild-b6-coturn-cutover |

Final acceptance gate: every row of `req-matrix.md` = VERIFIED.

**Dispatch protocol:** /projcore writes `prompts/batch-<n>.md`, sends to `lkvcdx-39` via 3-call tmux protocol with `$lead` persona switch, awaits callback to `callbacks.md` and `progress.md`.
