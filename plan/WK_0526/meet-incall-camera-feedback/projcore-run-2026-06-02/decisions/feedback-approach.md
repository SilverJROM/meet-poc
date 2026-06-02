# Decision — same-room feedback mitigation approach
2026-06-02. source: projcore (frontloaded to JROM via AskUserQuestion).

JROM chose: **SUPPRESSION ONLY**.
- Force EC/NS/AGC + software feedback suppression on the audio path.
- NO detection UI, NO auto-mute, NO warning banner.
- Rationale: non-intrusive; JROM does not want auto-mute/warnings.
- Honest caveat surfaced to JROM: software cannot 100% cancel cross-device acoustic feedback; headphones/muting one device is the only total fix. Suppression reduces it.
