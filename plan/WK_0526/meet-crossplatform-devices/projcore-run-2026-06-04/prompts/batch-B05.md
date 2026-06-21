BATCH B05 — join gate robustness + listen-only flag (P0.4: A5). PLAN HANDSHAKE FIRST.

Context: B01/B02 made mic acquisition robust (ladder exact→ideal→default). The join gate is room.page.ts missingJoinPrereqs()/hasMicAccess() which requires a LIVE audio track to join. PRIOR JROM DECISION (2026-06-02): "keep mic required to join" — do NOT silently reverse it.

TWO PARTS:
1. GOAL-BLOCKING (fix now): ensure a MIC-CAPABLE device is NEVER blocked from joining by a TRANSIENT/exact mic failure — the join/lobby path must run mic acquisition through the B01/B02 ladder BEFORE gating, so any device that HAS a mic gets a track and passes. Audit: does startLobbyPreflight/ensureSelectedAudioDevice/hasMicAccess now reliably yield a track for a mic-capable device after B01/B02? If a transient failure can still wrongly block, fix it (retry via ladder before showing the prereq block). 
2. PRODUCT DECISION (DO NOT implement without explicit approval — just analyze): allowing a TRULY no-mic device to join LISTEN-ONLY (hear only, muted) reverses the 2026-06-02 keep-mic-required decision and is below the stated minimum (mic+speaker). Describe exactly what listen-only would require + risks, but leave it for JROM. 

PROPOSE (reply PROPOSED, WAIT): part-1 audit (covered vs fix needed) + the fix if any; part-2 listen-only analysis (NO code). files, no-regression, complexity. FIRST append callbacks.md: [projcore callback] B05 PROPOSED <one-line>; on done [projcore callback] B05 DONE <one-line>.
