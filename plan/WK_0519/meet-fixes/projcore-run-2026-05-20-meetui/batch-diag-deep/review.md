# DR-41 Review

## Scope Check

- DR-41 only: implemented all-participant diagnostics posting, admitted-member POST authorization, owner-only viewing preservation, and logging toggle.
- DR-43 not implemented in this slice.
- No DR-40 recovery, DR-42 video, or call/admit/identity policy changes.

## Security Review

- POST no longer depends on owner auth, because guests may be unauthenticated.
- POST requires `sessionId`, `clientKey`, and `participantId` to match the signaling-recorded admitted/reconnecting peer for the live session.
- Authenticated requests also require the auth user to match the signaling peer email when the peer had one.
- A never-admitted client with a supplied session id is rejected with `403`.
- Owner diagnostics list/detail/download routes still require owner auth and were not loosened.

## Residual Risk

- Validation is intentionally tied to live signaling memory for the active session. Historical/offline uploads from a closed room remain rejected, which matches DR-41's requirement that only admitted session members may post.
