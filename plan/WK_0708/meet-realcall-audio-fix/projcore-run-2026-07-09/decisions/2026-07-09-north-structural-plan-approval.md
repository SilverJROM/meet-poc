# North structural plan APPROVED + 5 corrections (2026-07-09)

1. Piper ONLY on .123: `ssh silverjrom@192.168.254.123` → `/home/silverjrom/voicesim/piper/piper --model .../en_US-amy-medium.onnx`. Generate there, scp, commit. No install on .140.
2. .140 has NO audio stack (no pactl/PA/PipeWire). real-virtual-mic ONLY on .123. Hearability: .123 = real-virtual-mic; .140 = fake-device + real speech wav. Never AC2 from fake-only.
3. Two piper voices (download second). Reuse alice-host/bob-local speech set.
4. Fixture gate: manifest → whisper same backend stack + --force; test not checklist.
5. CallDriver: remove fake-device from DEFAULT; device_mode REQUIRED no default.
AC15 stays SCOPED until .123 re-demo. Resume AC only after B00S-SPEECH + B00S-DEVICE both VERIFIED.
