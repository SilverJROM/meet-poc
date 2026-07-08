# Room password + admission policy (per-room setting)

- **Type:** feature
- **Status:** LOGGED — recording->transcription fix went green 2026-07-02 (unblocked), then
  picked up as R6 in `projcore-run-2026-07-03`, NOT STARTED — that run PAUSED 2026-07-04 (token
  budget, JROM) before any work began on this item.
- **Raised:** 2026-07-01
- **Handler:** projcore (next batch after recording test closes)
- **qa_verification:** pending

## JROM verbatim
> "i just realized another change i want to add, on the app, log this to fix on this list after your
> testing and all green, i can set a password on the room, and i also i can manually set on the meeting
> as well to auto allow joiners with password, and the ones without password needs my approval on the
> room this is a room setting, i can auto allow joiners with password or they still need to be admitted,
> so if allow w/ password, they are auto admitted, no passwords knocks and wait to be admitted. if all
> requires admisison, w/ password or not they require admission to the room"

## Interpretation (to confirm at pickup)
Two new room-level controls (settable on the room, and adjustable live in-meeting):
1. **Room password** — owner can set a password on a room.
2. **Admission policy** (room setting, toggleable):
   - **Auto-allow with password:** a joiner who enters the correct password is **auto-admitted**
     (no knock, no wait). A joiner **without** the password **knocks and waits** for host approval.
   - **All require admission:** everyone — with or without password — must be **admitted by the host**.

So the policy gates whether a valid password bypasses the knock, or whether admission is always manual.

## Notes
- Interacts with existing lobby/knock + auto_admit flow (room-decisions.ts, admit path, guest lobby
  #guest-display-name → Continue → Ask to join). Password entry UI needed in the join/lobby flow.
- "manually set on the meeting as well" → the policy + password must also be adjustable in-call, not
  only at room creation.
