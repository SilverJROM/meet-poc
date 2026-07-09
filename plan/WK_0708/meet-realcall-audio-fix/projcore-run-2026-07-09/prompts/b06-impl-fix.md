# B06 SEND-BACK — validator FAIL

## Findings
1. Acceptance needs real PipeWire-attenuated evidence OR explicitly re-scope with measured attempt. Scaffold alone fails.
2. Live .123 IS reachable: silverjrom@192.168.254.123 — pactl present, PipeWire sources exist. Fix stale peer2@192.168.1.123 docs.
3. Do NOT mutate live mic without restore. Pattern: read volume → set attenuate → measure → restore.

## Required for DONE
Minimum path:
- Fix host to silverjrom@192.168.254.123
- Script that can: list sources, set source volume to known %, restore, log intendedAttenuation
- At least one SSH dry-run of read/set/restore with restore verified
- Document what still needs full browser call for AGC measurement
- If full dual-call not possible in 25min, produce decisions/b06-findings.md with: live discovery evidence, volume control proof, explicit OPEN for full call

## Handshake
PROPOSED short → wait APPROVED-PLAN → fix → commit → DONE
