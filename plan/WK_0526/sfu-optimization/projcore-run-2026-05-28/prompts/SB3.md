Batch SB3 — Adaptive simulcast off the connection-quality signal (SR4)

You are the IMPLEMENTER (codex gpt-5.5). Claude /projcore supervises from `lkvc`. Context /clear'd — start fresh from this brief + the files.

Context (accepted, prior slices):
- SB1: backend ICE now preserves the TLS/TCP TURN relay path.
- SB2: a LOCAL connection-quality signal now exists at `SfuClientService.connectionQuality()` (signal) / `collectConnectionQuality()`, sampled every 5s in RoomPage, with `route: 'direct'|'relayed'|'unknown'` and `band: 'good'|'fair'|'poor'`.

Requirement (verbatim):
- SR4: adaptive simulcast — subscriber video layer selection (we already publish h/m/l) responds to the SR3 quality signal: a subscriber on a poor/degraded link is dropped to a lower layer (m/l) to reduce lag; recovers to a higher layer when the link improves.

What already exists (reuse, do NOT rebuild):
- `sfu-client.service.ts` already publishes 3 simulcast layers (h/m/l) and already chooses a **preferred subscribe RID** that varies by mobile / screen-share / number of subscribed video peers. Find that RID-selection function — SB3 ADDS the quality band as one more input.

Mechanism (the lever, in an SFU): when MY connection is poor/relayed-degraded, request a LOWER layer for the remote videos I subscribe to (less inbound bandwidth → less lag for me). When my connection recovers, restore the normal RID.

Scope (atomic, surgical):
1. Feed the SB2 `connectionQuality().band` (and route) into the existing preferred-RID selection as an additional constraint:
   - band 'poor' (or relayed sustained-degraded) → cap subscribed RID at the lowest layer ('l'), or one step down from whatever the existing logic picked.
   - band 'fair' → at most 'm'.
   - band 'good' → existing logic unchanged.
2. **Hysteresis / no flapping:** only downgrade/upgrade on a sustained band (reuse SB2's episode concept or require N consecutive samples), and apply the new RID to existing subscriptions when it changes (re-request layer), not just new ones.
3. Recovery: when band returns to good for the sustained window, restore the pre-existing RID logic's choice.

Hard guards:
- Do NOT change publish encodings (keep h/m/l as published), negotiation, screen-share, recording, reconnect, or the SB1/SB2 code except to READ connectionQuality.
- Keep the existing mobile/screen-share/peer-count RID rules intact — quality is an ADDITIONAL cap, applied as min(existing choice, quality cap).
- No new deps. Surgical diff.

Plan handshake (MANDATORY before code):
1. Read this brief + the RID-selection logic in sfu-client.service.ts + how connectionQuality is exposed/sampled.
2. Reply PROPOSED: exact function(s) touched, how the quality cap composes with existing rules (min-layer), hysteresis approach, how a layer change is re-applied to live subscriptions, and how SR4 is observable (e.g. when band forced poor, subscribed RID drops to 'l'; recovers on good). 
3. End: `STATUS: PROPOSED — <one-line>`. Wait for APPROVED-PLAN.

After APPROVED-PLAN: implement, `cd frontend && npm run build`, write SB3-changes.md + callback FIRST to callbacks.md, then `STATUS: DONE — <one-line>`.
