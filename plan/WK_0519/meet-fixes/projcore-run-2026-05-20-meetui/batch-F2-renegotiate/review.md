# Batch F2 Renegotiate Review

## Diff Review
- Scope is limited to DR-55 negotiation behavior and its e2e proof.
- Audio sender creation is unchanged.
- Existing camera-on-at-join path still uses `pc.addTrack(videoTrack, localStream)` and stores that sender in `videoSenders`.
- Camera-off-at-join path now creates one `sendrecv` video transceiver and stores its null-track sender in `videoSenders`.
- `replaceLocalSenderTrack('video', track)` already checks `videoSenders.get(peer.id)` after track-kind lookup, so the new stored sender makes toggles use `replaceTrack()`.
- `applySenderBandwidthPreferences` now recognizes the stored null-track video sender as video, so preference application does not depend on `sender.track?.kind`.
- `onnegotiationneeded` reuses `sendOffer`; it does not add a second glare/offer state machine.

## DR-40 / Perfect Negotiation Check
- ICE restart remains direct: `restartIce()` still calls `sendOffer(clientId, pc, meta, true)`.
- The new negotiation-needed backstop only calls `sendOffer(..., false)`.
- It is guarded by current peer ownership, not reconnecting, `pc.signalingState === 'stable'`, and `!meta.makingOffer`.
- Existing polite rollback / ignored-offer handling remains the only glare machinery.

## Null-Track Sender Check
- `pc.addTransceiver('video', { direction: 'sendrecv', sendEncodings: [{}] })` gives the sender an encoding slot before a track is attached.
- The e2e asserts native `sender.getParameters().encodings[0]` has the expected video preferences through `window.__meetDebug.senderSnapshot()` before camera-on.

## Risks
- `onnegotiationneeded` can now create an offer where the old code only logged. The stable/makingOffer guard and existing perfect-negotiation collision handling are the controls against glare loops.
