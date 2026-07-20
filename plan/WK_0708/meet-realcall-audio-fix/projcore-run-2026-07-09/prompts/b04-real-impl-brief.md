# B04-real: Real dual-browser T_gap derivation

Batch: B04-real
§4b: impl_tier L2 (haiku), validator_tier L2 (codex55 if headroom>=1% else sonnet interim + note), delib=no, redteam=yes (budget)

## Goal
Replace provisional 500ms wiring with a **measured** T_gap from real dual-browser calls on B08S spine.
No AC may close on provisional 500ms after this lands.

## Binding definition (D27)
A dropout = span with **no voiced energy at far end while the script says that peer was speaking**, corroborated by missing transcript words — **never** an inter-utterance pause.

## Scope
1. Use CallDriver + receive-side recorder + real speech feed (alice-host or real speech fixtures — NOT bot-140/hello.wav which is a 440Hz tone).
2. Two instrumented calls (burn **exactly 2** total via ledger delta; budget note: ledger is polluted/split — assert per-run delta, document absolute state). Prefer shorter instrumented runs if 3-5min full is too costly but capture enough speech windows for dropout distribution (document if shortened with justification; plan says 3-5 min — prefer at least ~60-90s of scripted conversation if full 3-5 is prohibitive under burn pressure, but aim for plan).
3. Compute audible-dropout distribution from receive WAV + STT/whisper if available (local whisper path proven in B08A-3).
4. Write decision file: `$RUN_DIR/decisions/T_gap.md` with measured T_gap ms, histogram, evidence paths, burn count. Supersede T_gap_provisional.
5. Do NOT close any AC. B14/B15/B16 re-verify later.

## Auth / join
Use B08A-3 harness path: authenticated createRoom, waitForPublishedAudioBytes, onLive if needed. Spine INVALID_RELOAD fix is in.

## Handshake
First output PROPOSED (mechanism, files, est, risks, burn plan). STOP for APPROVED-PLAN.

## Callbacks
[projcore callback] impl B04-real STATUS: PROPOSED|WORKING|DONE|BLOCKED — note

## Out of scope
Product gain fix, AC1 sweep, Mode recovery, ledger redesign (log only).
