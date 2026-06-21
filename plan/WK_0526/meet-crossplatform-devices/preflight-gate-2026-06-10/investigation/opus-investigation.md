# opus investigation (empirical + design)

## Root cause — confirmed from DATA (not just code)
Real call 4b14bc30: joiner Joanne (MacBook/Chrome, admitted, WS-connected, lastGumError=null) had hasPc=FALSE for all 10 samples, outboundTracks=[], publishStatus=null, empty cfSessionId; host had ZERO inbound from her. CONFIRMED: her client never created a PC / never published; nothing transmitted. Same symptom as the (already-fixed) playout bug, different layer (upstream).

Most-likely path: publish() (sfu-client:1671 creates PC) is only reached via publishSfuOnceAfterAdmit (room.page:1605) → awaits initialPublishStream() (1606) THEN publish() (1607); the whole retry loop (1563) is gated on state()==='in-call'. hasPc=false + publishStatus=null (publish() never STARTED, not failed mid-way) most strongly implies publish() was NEVER CALLED — i.e. EITHER her state never reached 'in-call' (admitted server-side but client stuck in connecting/waiting-room), OR initialPublishStream() hung before 1607. publishError=null rules out an in-publish throw.

THE OBSERVABILITY FIELD TO ADD (proves it next time): persist roomState + a publishAttemptCount/publishPhase + initialPublishStreamResolved boolean in the diagnostics payload. Currently roomState is NOT in the persisted payload — that gap is why we can't fully disambiguate. (One field if forced to pick: roomState at sample time.)

## Design recommendation (R1-R7)
- R3 connection-confirmation: DON'T build a throwaway dry-run session. Instead make the REAL join->publish robust + VISIBLE: keep a distinct UI substate ("connecting your audio…") until localPublishState()==='published'; only then show fully-in-call. If publish doesn't reach 'published' within the retry cap → HARD friendly failure ("We couldn't connect your audio — Retry") and do NOT leave them sitting silent-in-call. This directly closes hasPc=false (it becomes a loud, retried, blocking state).
- R7: guarantee publish() ALWAYS fires after admit (a watchdog: if state===in-call/admitted AND hasPc===false AND not-publishing for >Ns → force publishSfuOnceAfterAdmit + log). No silent never-publish.
- Gate (R1/R2/R5): extend the lobby into the green-room — Join hard-disabled until classifyMicCapture confirms real mic energy (reuse lobbySelfTestFlag) AND speaker test passes. Camera optional.
- R4 device-config-test panel: on any fail, surface a settings panel (mic level meter live, "Test speaker" tone, camera preview, device <select> dropdowns) + a "Confirm it's working" that re-runs validation. Reuse classifyMicCapture + speakerTest.
- R6: Meet/Zoom green-room visual — calm, minimal, mobile-first.

## Risk: the gate itself must not become a NEW way to get stuck (e.g. speaker-test autoplay blocked on mobile, or the connection-confirm hanging) — every gate step needs its own timeout + friendly escape + the config panel. The connection-confirm must have a bounded retry then a clear failure, never an infinite "connecting…".
