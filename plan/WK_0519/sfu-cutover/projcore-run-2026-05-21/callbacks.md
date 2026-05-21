# Callbacks — SFU cutover run

[projcore callback] B0 PROPOSED 2026-05-21 — cap constants located, mobile cap helper identified, plan ready for handshake
[projcore callback] B0 DONE 2026-05-21 — MAX_ADMITTED=30, mobile cap removed, build clean, 3/3 tests pass
[projcore callback] B1 PROPOSED 2026-05-21 — module shape, authz, ownership, error contract, tests defined; awaiting APPROVED-PLAN
[projcore callback] B1 DONE 2026-05-21 — realtime-sfu module created, 6 routes registered, build clean, 3/3 tests pass (real CF smoke OK)
[projcore callback] B2 PROPOSED 2026-05-21 — single-batch plan; service shape, queue design, publish flow, test strategy detailed; awaiting APPROVED-PLAN
[projcore callback] B2 PROPOSED (revised) 2026-05-21 — revised test: Playwright e2e with fake media + ?sfu=1, asserts cfSessionId non-null + outbound-rtp audio+video via getStats; service design unchanged; awaiting APPROVED-PLAN
[projcore callback] B2 DONE 2026-05-21 — SfuClientService created, op queue, CF STUN+TURN, pre-negotiated video, publish flow complete; Playwright e2e 1/1 pass (cfSessionId truthy, status=published, outbound-rtp audio+video); build clean; committed 97900bd
[projcore callback] B3 PROPOSED 2026-05-21 — message shapes, LiveRoom additions, revision scheme, stale-rejection, full-roster-on-join, frontend roster model, test plan; awaiting APPROVED-PLAN
[projcore callback] B3 DONE 2026-05-21 — sfu-publish handler, sfu-presence broadcast, sfu-roster on admit, revision scheme, frontend roster model (remotePublishers signal), pure-function stale-rejection; backend build clean, 3/3 integration tests pass, frontend build clean, frontend unit spec 8/8 assertions pass; committed 66ab520
[projcore callback] B4a PROPOSED subscribe flow via enqueue, mid mapping, remote stream signal, sfuPeers computed, isSfuMode gate, two-client inbound-rtp e2e
