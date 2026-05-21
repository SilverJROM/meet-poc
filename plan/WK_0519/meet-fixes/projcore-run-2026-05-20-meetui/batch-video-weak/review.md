# Batch video-weak Review

Scope check:
- DR-42 only. No identity, reconnect, diagnostics, chat, or layout behavior changed.
- Manual audio-only path still uses the existing immediate pause behavior.
- DR-34 dedicated remote audio sink is untouched.

Risk review:
- Audio priority remains `high` / `high` for every sender preference update, including degraded and paused tiers.
- Degraded tier does not add `autoPausedReceivers` and does not send `videoPaused: true`; it sends `videoDegraded: true` with video active.
- Existing `auto-poor` audio-only reason remains reserved for the floor pause path, so UI "audio only" does not appear during degraded video.
- Recovery clears both degraded and floor auto state only after `AUTO_RESTORE_GOOD_SAMPLES`, and never sends an auto-unpause while manual audio-only is enabled.

Residual risk:
- Browser support for `scaleResolutionDownBy` and `maxFramerate` in `setParameters` varies. The existing preference application already catches unsupported sender-parameter updates; audio priority remains best-effort through the same path as DR-13.
