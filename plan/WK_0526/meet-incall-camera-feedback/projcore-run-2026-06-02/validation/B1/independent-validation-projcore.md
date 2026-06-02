# B1 Independent Validation — projcore (verifier ≠ fixer)
2026-06-02. Commits 3c49133/ed48fb4/cd4a8b7/dcda820 on feat/incall-media-always-enableable-20260602.

VERDICT: PASS for what's reachable. Camera in-call acquire = VERIFIED (live-proven e2e S4). Mic in-call toggle = non-stiff (always a flip since mic is a join prereq). Mic acquire-from-absent = built + unit-proven (media-toggle spec) but UNREACHABLE behind the lobby hasMicAccess join gate → surfaced to JROM as a decision.

Checks I ran:
1. Scope: media.service.ts(+69), room.page.ts(+25), media-toggle.{ts,spec.ts}(new), e2e b1-incall-media(new), artifacts. No SFU/feedback/diagnostics. CLEAN.
2. toggleMic/toggleCamera diff: both route through pure resolveMediaToggleAction (acquire|enable|disable); 'acquire' getUserMedia → adopt-as-localStream if null / addTrack → set on → publish via callback → startMicLevel. Mirror of replaceAudioTrack / working video path. Correct.
3. room.page toggleMic now awaits async media.toggleMic, publishes via sfuClient.replaceAudioTrack, broadcastMediaState(mic,...). Correct.
4. Unit: `npx tsx media-toggle.spec.ts` → all assertions passed, exit 0.
5. Build: independent ng build exit 0.
6. Camera live-proven: e2e S4 (B outbound frames>0, sfuPublishState stays published) — implementer evidence, screenshots present.
7. Never-stiff: controls-bar buttons never [disabled]; NotAllowedError → dismissible actionNotice hint (non-blocking). Correct.

FINDING (honest, flagged by qa): the lobby missingJoinPrereqs() blocks join without a live mic track (hasMicAccess, room.page.ts:1916-1919). So mic-less join is impossible today → the in-call mic-acquire path can't be reached. JROM directive ("don't unallow mic inside the call... not stiff") is met for the in-call control, but joining mic-less + adding it in-call requires relaxing this gate. DECISION → JROM.
