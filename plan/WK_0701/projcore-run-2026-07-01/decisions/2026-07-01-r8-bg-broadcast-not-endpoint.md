---
date: 2026-07-01
project: meet-poc
type: implementer-proposal-approved
source: batch-R8
priority: medium
search_hooks: [background, custom-background, peer-visibility, rbac, ws-broadcast, media-state, background-image]
---

# R8b mechanism: broadcast thumbnail over WS signaling, not a shared/served backend endpoint

## Decision
Custom/account background images are made visible to remote peers by generating a small
(~120KB, capped at 200,000 chars server-side) client-side thumbnail and relaying it through a new
`background-image` WS message on the existing per-call signaling channel — the same trust boundary
that already carries SDP/media-state between call participants. Rejected: opening or loosening the
account-background image endpoint (`/api/account/backgrounds/:id/image`) so a remote peer's
browser could fetch another user's private image directly.

## Why
The brief's own suggested mechanism ("a shared/served URL") would require a new cross-user
access-control decision — should peer B ever be able to fetch peer A's private background image,
and under what scope/expiry — which the brief explicitly flagged as a candidate for NEEDS-INFO
rather than guessing RBAC. The WS-broadcast approach sidesteps that decision entirely: no new
backend auth surface, no new endpoint, and the data travels through a channel two call
participants already implicitly trust each other with (camera/mic media, SDP, chat).

## Counterfactual
A served-URL approach would have required either (a) a new "current room members" access check on
the existing endpoint (meaningful new authz code path, needs security review), or (b) a
separate public/signed-URL scheme with its own expiry/scope questions — both real architectural
decisions a human should weigh in on. The broadcast approach needed none of that, at the cost of
re-sending a capped thumbnail on background-change/join rather than a single served URL.

## Approved
Coordinator (projcore) APPROVED-PLAN'd this mechanism explicitly, additionally requiring: a
server-side hard size cap independent of client compression (implemented), and that the heavy
image payload be sent on its own message type — never piggybacked on `media-state` — so mic/cam
toggles can't spam it (implemented).
