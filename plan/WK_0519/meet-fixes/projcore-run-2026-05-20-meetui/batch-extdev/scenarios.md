# DR-29 Scenarios

- Lobby autopick mismatch: fake devices list external mic first, default `getUserMedia({ audio: true })` returns built-in mic, and the app reconciles to the selected external mic before join.
- Reacquire only on mismatch: once the external mic track is active, clicking Join does not perform another exact external-mic acquisition.
- Published sender proof: after a guest is admitted, DR-28 diagnostic snapshot reports outbound audio `source: sender` and `deviceId: extdev-external`.
- Mid-call switch: selecting another mic in the in-call device dialog replaces the local stream track and outbound sender track with that selected deviceId.
- Exact-device failure: if the selected external mic becomes unavailable, in-call switching falls back to default audio and updates the selected mic value to the acquired built-in device.
- Reconnect: after signaling reconnect, the resumed peer connection still publishes the selected mic deviceId and keeps audio sender priority high.
