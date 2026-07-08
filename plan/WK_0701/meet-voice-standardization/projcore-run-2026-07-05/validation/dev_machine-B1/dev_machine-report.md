# Dev Machine B1 Validation

Date: 2026-07-05

Verdict: PASS for DEV live validation on `dev_machine` after restarting the local backend with `.env` loaded for Cloudflare SFU credentials.

Evidence:
- Host/remote proof used fresh room `fbadf0e9b632` over `https://voice.silverjrom.app/room/fbadf0e9b632`.
- Remote guest on `dev_machine` reached SFU connected state:
  - `connectionState=connected`
  - `iceConnectionState=connected`
  - `signalingState=stable`
  - publish status `published`
- Remote fake silent mic produced measurable flat capture-side stats:
  - repeated `media-source` rows with `audioLevel=0`
  - repeated `totalAudioEnergy=0`
- Visible retry copy was present throughout the observation:
  - `Still trying to restore your microphone...`
  - intermittent `Checking your microphones for sound...`
- Recovery attempts were bounded and recurring, not a tight storm:
  - `getUserMedia` count reached 12 over about 30 seconds while sweeping multiple fake input devices.
- No page errors were recorded; only known `[GATE] checkIceConfigForJoin` diagnostic logs appeared.

Artifact:
- `dev-b1-host-remote-probe.log`

Note:
- Earlier solo-room probes were not accepted as proof because they either did not create a peer connection or did not prove the exact retry banner. The accepted pass is the two-ended host plus remote dev_machine proof above.
