---
date: 2026-05-29
project: meet-poc
type: scope-injection
source: projcore
priority: high
search_hooks: [device-self-test, false-pass, lobby-mic-test, configure-devices, R8]
---

# R8 injected — device self-test must not give a false pass

**JROM (verbatim):** "perhaps one thing to add here or fix is to properly fix the self test on the user, if its truly not sending it should be flagged or can be flagged by the user on his test/configure devices, its unacceptable to pass that and yet when on a call it does not work perhaps we should look into fixing that as well"

**Decision:** New requirement R8 (device self-test fidelity). Injected as batch B5, placed AFTER B2 (capture root-cause fix) rather than queue-end, because it's the same subsystem and B5 verifies the self-test measures the fixed path. Folded with defaults under the NS9 greenlight (no re-interview). Depends on B1 + B2.

**Counterfactual:** Default §1.4b placement is queue-end; overridden to after-B2 on coupling grounds (logged). Risk if not done: the in-call fix lands but the pre-call test still lies, so users still get burned before they ever join.
