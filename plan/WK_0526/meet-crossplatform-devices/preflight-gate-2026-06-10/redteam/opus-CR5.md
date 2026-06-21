# opus RED-TEAM CR5 (multi-guest / reconnect / bypass)

## Gate-bypass: NONE
join() (room.page.ts:857) re-computes missingJoinPrereqs() AFTER re-acquiring mic, and RETURNS early (showJoinPrereqPopout) if missing.length>0. micWorking (positive) + speakerVerified must both be true (missingPreflightPrereqs) to proceed. No path reaches in-call/publish without passing mic+speaker. Enforcement is in the handler (not just a disabled button) — robust against click/race. (Speaker 'Yes' without truly hearing is user-error, not a bypass — Meet/Zoom-equivalent; acceptable.)

## Multi-guest: badge keyed per clientId
updateRemoteAudioHealth keys remoteAudioUnhealthyIds, peerFirstSeen, prevInboundBytes by clientId; iterates peers() per peer. 3-guest (broken/muted/healthy) -> only the broken (admitted+past-grace+unmuted+!publishing) is added. Muted -> ok. Healthy -> ok. No cross-peer bleed (per-clientId maps). peerFirstSeen pruned of departed.

## Reconnect/rejoin: re-runs
rejoinAfterInitialPublishFailure (html:224) + the join path re-run the gate + publish. A guest who leaves during grace -> pruned from peerFirstSeen (2989) -> on rejoin gets a fresh first-seen -> fresh 7s grace (no stale badge). Host WS reconnect re-syncs roster.

## Host-is-also-user: host passes the same gate (missingJoinPrereqs is role-agnostic) + sees own failures via the same surfaces.

## Findings: no [CRITICAL]. (Minor/NON-CRITICAL: Join is enforced by handler-return rather than a disabled button — functionally a hard gate, UX could also grey the button, cosmetic.)

STATUS: CRITICAL-CLEAN — no bypass, multi-guest badge correct, reconnect re-runs cleanly, host gated too.
