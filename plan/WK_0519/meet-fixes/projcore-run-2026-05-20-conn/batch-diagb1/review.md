# DIAGB1 Review

## Scope Check
- In scope: DR-6, DR-7, DR-9, DR-10.
- Out of scope: DR-1, DR-2, DR-3, DR-4, DR-5, DR-8.
- Backend change is additive: legacy `knock` shape remains intact.

## Risk Review
- Quick-join changes keep `DeviceDialogComponent` intact and only change when it is rendered.
- Pending-list snapshots can replay without re-ringing because the first post-admission snapshot is suppressed and `knock` remains the normal new-request chime path.
- ICE config failure remains non-fatal, consistent with DR-5 fallback behavior, but now surfaces readable setup feedback.

## Residual Risk
- Co-host admission is not implemented in this codebase; if co-hosts are added later, backend owner filtering must be generalized to an admitter-role predicate.
