---
date: 2026-06-08
type: security-finding
status: FIXED in CR-fix-8 (JROM folded in); validated PASS
agent: projcore
source: code-redteam CR9 (lens L9 privacy)
qa_verification: pending
---
## Finding (verbatim from codex55 CR9)
Raw `clientKey` is persisted in the owner-readable meeting diagnostics payload. `room.page.ts:3530` includes
`clientKey: readClientKey()` in every diagnostics payload; backend stores the whole payload (store.ts:282) +
`participant_client_key` (store.ts:288). signaling treats clientKey as the "unforgeable, post-admission-only
anchor" for diagnostics/reconnect identity. Recommendation: use clientKey to AUTHORIZE the POST, then STRIP or
HASH it before persistence/readback.
## Scope note
PRE-EXISTING (git diff confirms the remote-audio fix did NOT add clientKey to the payload). ORTHOGONAL to the
host-can't-hear fix. Fixing requires BACKEND changes + touches the reconnect-identity mechanism (sensitive).
## Not-bugs (owner-scoped, acceptable per current contract)
Raw sinkId/device-ids/trackId/manifest in payload are OWNER-ONLY readable (server-gated) → acceptable; only a
concern under a hypothetical stricter "always redact device-ids" policy.
