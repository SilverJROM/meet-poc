# B20 Scenarios

## UX1 Guest Back Link
- Guest sees the not-found, rejected, or error state panel.
- Expected: link label is "Back to home" and routes to `/`.
- Signed-in user on the same panels still sees "Back to rooms" and routes to `/app/rooms`.

## UX2 Chat Enter Behavior
- Plain Enter in the chat textarea submits the current draft.
- Shift+Enter does not submit and allows the textarea newline behavior.
- IME composition Enter, including keyCode 229, does not submit mid-composition.
- The composer submit button/form path still calls `sendChat`.

## D1 Protected Guest Join
- Guest opens a protected room through `/join`.
- After entering a display name, the existing room password prompt opens before lobby device check.
- Correct password proceeds through existing `submitRoomPassword()` to `prepareLobbyDeviceCheck()`.
- Wrong or missing password remains in the existing prompt/error flow and does not proceed to signaling.
- Open-room guest, owner, signed-in, and stashed-password paths remain unchanged.

## CMP1 Device Select Reopen State
- Camera select reflects `selectedVideoId()` through per-option selection.
- Speaker select reflects `selectedAudioOutputId()` through per-option selection.
- Empty speaker-output state keeps the "System default" option selected when no output is chosen.
- Existing mic select and device change handlers remain unchanged.
