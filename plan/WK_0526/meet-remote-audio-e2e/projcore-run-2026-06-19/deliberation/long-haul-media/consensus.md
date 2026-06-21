# Red-team consensus — long-haul media / cross-machine harness (2026-06-20)

Two independent analyses (signaling-diagnosis + architecture-redteam), convergent.

## Signaling root cause (the immediate admit blocker)
ROOM MISMATCH (HARNESS bug, not app): the guest knocks on a different room than the host hosts. Host on `7bc6fb1f3762`, guest ran against `12cjr`; backend logs no KNOCK on host's room + guest gets no myClientId → knock landed in an orphan room. FIX: pass guest the CANONICAL room.id URL (not slug), verify host+guest same id, pkill stale remote runs. App signaling logic is correct.

## Architecture red-team verdict
- Every B1 failure (~3.5h) has been HARNESS/coordination (page-close, host WS bg-throttle, host↔guest timing, device-gate, stale room) — NOT the call/SFU/TURN path.
- Cloudflare Calls SFU means clients talk to their NEAREST CF edge (not peer-to-peer long-haul); TURN relay confirmed (local guest got a relay candidate); app proven locally. So genuine long-haul media is ~90% likely fine — remaining ~10% risk only resolvable by connecting ONCE.
- We're over-investing in a self-driving two-machine harness that diverges from the real call (the charter risk JROM named).

## Recommendation (ranked)
1. **C — Prove remote media connects ONCE, then make the real JROM+Peer2 call the acceptance.** Fastest path to a trustworthy answer; final proof = the real thing.
2. **B — Stable long-running host** (persistent browser, NOT under PW test teardown) so a guest can join anytime — kills the timing/throttle/page-close bug class. Enabling means for C.
3. **D — Keep automated regression for stable parts (local audio + signaling); human-in-the-loop for long-haul media.** Steady-state posture.
4. **A — Keep grinding full-auto harness. REJECT** (sunk cost; lowest fidelity-per-hour; even green answers a weaker question than a 10-min human call).

## The one decision for JROM
Keep grinding the fully-automated two-machine harness, OR pivot: stable always-on host + ONE clean observation that creepy-mini media connects over the relay + make acceptance YOUR real call with Peer2 (one-click). Red-team recommends the pivot (C+B).
