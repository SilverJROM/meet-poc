---
date: 2026-05-29
project: meet-poc
type: scope-refinement
source: projcore
priority: high
search_hooks: [one-way-audio, silent-mic, external-mic, getUserMedia-constraints, device-selection, greenlight]
---

# Mic hardware works ⇒ root cause is our capture code; greenlight to fix aggressively

**JROM (verbatim):** "ok but the user, said he can test the mic and its working then what is the problem here? is it the code? go ahead and fix this and improve the diagnostics if we can go you have greenlight go ham at this problem"

**Trigger context:** Initial diagnosis showed the remote peer's published audio carried near-zero RTP with 0% loss + healthy video ⇒ sender-side silent track. JROM clarified the user had TESTED the mic (working) and it worked on Google Meet.

**Decision:** Hardware is good ⇒ the silent capture is OUR bug. B2 must root-cause-fix the capture path — (a) device selection (right device actually reaches getUserMedia, no silent default fallback) and (b) audio-constraint incompatibility with external/USB/multi-channel interfaces — with the silent-mic watchdog as a safety net, not the fix. Operating mode set to GREENLIGHT / autonomous-complete ("go ham"): aggressive + thorough, no extra questions, stop only on a real §1.18 blocker. Folded into north-star NS9; implementation-plan B2 restructured to B2a (root-cause) → B2b (watchdog).

**Counterfactual:** Without this, B2 risked shipping detect-and-warn only (a band-aid) while leaving the actual capture bug unfixed.

**Verifier≠fixer unchanged:** projcore still validates each batch independently.
