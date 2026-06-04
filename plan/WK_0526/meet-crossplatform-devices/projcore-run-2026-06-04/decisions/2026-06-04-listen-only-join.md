# DECISION FLAG for JROM — listen-only (no-mic) join
date: 2026-06-04 · source: projcore · status: AWAITING JROM (deferred, not implemented)

B05 part-1 (goal-blocking) DONE no-code: mic-capable devices are never blocked from joining (acquireAudio ladder runs before the gate; room.page:783 + media-acquisition:92). A true no-mic device still blocks — this PRESERVES JROM's 2026-06-02 "keep mic required to join" decision.

OPEN QUESTION (B3/A5 listen-only): should a TRULY no-mic device be allowed to join LISTEN-ONLY (hear only, muted)?
- For: maximal universality (speaker+browser hears).
- Against: reverses the locked mic+speaker minimum; can mask real setup failures; needs a new join-capability state, listen-only in-call UI, media-state/diagnostics for mic=false (no local audio sender), recording + host/sidebar labels, and careful no-mic-hardware vs permission-denied/transient distinction.
projcore did NOT implement (reverses a prior explicit JROM decision + below stated minimum). SURFACE at handback; JROM decides. If yes → new batch (couples with B3 announce-first-audio).
