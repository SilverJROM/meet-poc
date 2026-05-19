---
date: 2026-05-19
project: meet-poc
type: autonomous-call
source: codex-implementer
batch: B2
priority: normal
search_hooks: [signaling, admitted state, peer-left, signal relay, legacy wire format]
---

**Question considered:** When a pending peer is manually admitted, should the new TypeScript signaling module update that peer's connection-local state to `admitted` even though the legacy helper did not have direct access to the pending socket closure's `state` variable?

**Decision:** Yes. `PeerEntry` includes `setState`, and `admitPeer()` calls `pending.setState('admitted')` before broadcasting admission.

**Reasoning:** R3.5 and R3.6 require all admitted peers to relay signals and emit `peer-left` on disconnect. Without updating the connection-local state, a formerly pending guest remains logically `pending` inside its socket handler and disconnects as a pending knocker rather than an admitted peer. The wire format remains identical; this changes internal state bookkeeping only.

**Default alternative rejected:** Leave the legacy closure limitation intact. That would preserve an implementation quirk but fail S2.10 and could fail guest-originated signaling after admission.

**Promotion target:** Keep as B2 implementation decision; no broader standing rule needed.
