# opus RED-TEAM CR2 (lens L2: gate + panel + persistence + edges)

## [CRITICAL] Mic gate is INVERTED — blocks working mics, admits silent mics
- nextMicWarningState (mic-energy.ts) is a WARNING reducer: returns TRUE on 'silent', FALSE on 'working'. So lobbySelfTestFlag (set from it at room.page.ts:3527) == TRUE means MIC IS SILENT.
- room.page.ts:2367 wires `micVerified: this.lobbySelfTestFlag()` — i.e. micVerified=TRUE when the mic is SILENT.
- missingPreflightPrereqs (room-decisions.ts): `else if (!input.micVerified) missing.push('mic-silent')`.
  => WORKING mic: flag=false -> micVerified=false -> 'mic-silent' pushed -> JOIN BLOCKED.
  => SILENT mic: flag=true -> micVerified=true -> not pushed -> SILENT MIC JOINS.
- Also preflightConfirmReady (256) = lobbySelfTestFlag() && speakerTested -> "ready when SILENT". Same inversion.
- IMPACT: every good user is locked out; the broken case it was meant to stop gets through. Worst-case gate behavior. FIX: micVerified must be the WORKING signal, e.g. `micVerified: !this.lobbySelfTestFlag()` (and invert preflightConfirmReady), OR introduce a dedicated micWorking signal (true=working) to avoid the warning-flag polarity confusion. Unit tests passed because missingPreflightPrereqs was tested with abstract booleans, not wired to lobbySelfTestFlag's real polarity — classic integration-wiring bug.

## [should-fix] Speaker gate validates a CLICK, not HEARING (R4 "confirm it's working")
- room.page.ts:1063: speakerTestCount++ fires right after oscillator.start() — i.e. on PLAY, not on the user confirming they heard it. A user with a dead/muted speaker who clicks "Test" passes the gate. Per R4 the panel should require a "I heard it / Yes" confirm after the tone, not just that it played.

## [verify] 'indeterminate' mic: nextMicWarningState returns `current` -> if a working mic only ever classifies 'indeterminate' (thin energy window), lobbySelfTestFlag stays at its init (false). Post-inversion-fix this would (correctly-polarity) read as not-yet-verified -> blocked until a 'working' sample lands. Ensure the meter gives the mic enough warm-up so a genuinely working mic always reaches 'working' (no indefinite block).

STATUS: CRITICAL-BUG — mic gate polarity inverted (blocks working mics / admits silent mics). + speaker-gate is click-not-heard.
