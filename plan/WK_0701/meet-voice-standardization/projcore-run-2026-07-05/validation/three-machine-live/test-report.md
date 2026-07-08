# Test Report: Three-Machine Live Gate

## Latest Target

- Runtime: DEV `https://voice.silverjrom.app`
- Room: `3-machine-live-1783297171134`
- Participants:
  - local host: `host-local-1783297171034`
  - SG remote: `sg-remote-1783297171034`
  - dev_machine remote: `dev-remote-1783297171034`

## Result

PASS.

Evidence file: `three-machine-result-1783297297305.json` (`three-machine-latest.json` was overwritten with the same latest run)

Summary:

| Endpoint | Outbound audio | Inbound audio | Result |
| --- | ---: | ---: | --- |
| local host | 476,945 bytes / 2,981 packets | 890,401 bytes / 5,550 packets from 2 remotes | PASS |
| SG | 922,046 bytes / 5,744 packets | 1,824,935 bytes / 11,335 packets from 2 remotes | PASS |
| dev_machine | 927,344 bytes / 5,782 packets | 1,837,918 bytes / 11,415 packets from 2 remotes | PASS |

Host final in-window state:

- `connectionState`: `connected`
- `remoteStreamCount`: 2
- remote peer states: SG and dev_machine both `connected`
- remote peer audio tracks: both `live`

## Notes

The first gate attempt produced valid RTP evidence but failed the harness because it captured the host after the remote clients had already exited. The harness was corrected so the host final snapshot is taken while both remotes remain connected, then the gate was rerun successfully.
