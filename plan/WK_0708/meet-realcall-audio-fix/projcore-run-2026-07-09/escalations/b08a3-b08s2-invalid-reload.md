# Escalation: B08S-2 INVALID_RELOAD false-positive on Angular SPA

**Raised by:** B08A-3 impl BLOCKED 2026-07-09
**Class:** spine defect in already-VERIFIED B08S-2 (loopback-only gate missed SPA bootstrap)
**Coord decision:** ladder-1 sendback with EXPLICIT scope expand into B08A-3 — fix mechanism + unit tests, re-prove B08S-2 unit taxonomy, complete B08A-3 live test. Not a north consult (mechanism clear). Not full B08S-2 re-open of design.

**Binding fix:** Only increment navCount after first RTCPeerConnection construction (pcCount >= 1), so Angular Router's initial replaceState during bootstrap does not trip INVALID_RELOAD. True mid-call SPA navigations after PC still trip. Update receive-side-recorder.test.ts rows accordingly.

**Ledger note:** callBurnCount was already elevated; minimize further burns; fail closed near 25.
