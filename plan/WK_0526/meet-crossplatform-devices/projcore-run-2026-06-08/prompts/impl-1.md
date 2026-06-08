# IMPL-1 — Per-publisher remote-audio registry (the host-hears-everyone fix)

You are the IMPLEMENTER (codex, gpt-5.5 high). Build EXACTLY the design below. A separate validator + projcore will independently verify — do not self-certify.

## FIRST tool call MUST be the callback append (streaming-order mandate)
Before any prose, append your STATUS to `plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-08/callbacks.md` via:
`printf '[projcore callback] IMPL-1 STATUS: <PROPOSED|DONE|BLOCKED> %s\n' "$(date -u +%FT%TZ)" >> <abs path to callbacks.md>`
Start with STATUS: PROPOSED (your plan), wait for APPROVED-PLAN from projcore, then implement, then STATUS: DONE (or BLOCKED).

## The spec (READ IN FULL — this is the contract)
`plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-08/deliberation/T1-host-inaudible-remote-audio/consensus-r4-registry.md`
(the FULL file incl "R5 additions (v2)", "R6 additions (v2.1)", "R7 additions (v2.2)"). Also skim `consensus-r3-revised.md` for B1-B10 detail. Root cause + why: `round1-synthesis.md`, `jrom-evidence-addendum.md`.

## Root cause (why this fix)
Host received clean inbound remote-audio RTP but heard NOTHING (no banner) because all remote audio was mixed through ONE Web-Audio destination → ONE `<audio>` element + `setSinkId` to a NON-default selected device routed it to the void (A4), compounded by an orphaned-graph path (A3). Fix = direct per-publisher `<audio srcObject=stream>` elements (no AudioContext in the audible path) owned by a central registry in RemoteAudioService.

## IMPL-1 SCOPE (this batch) — the registry playout rewrite. Implement these B-items:
- **B11**: stop using the Web-Audio mixer as the AUDIBLE path. `remoteAudioMixerEnabled` (room.page.ts:222) + `RemoteAudioService.mixerEnabled()` (191-193) are hardcoded true and the page (room.page.html:229-231,253/273/293) is hardwired to mixer mode — rewire to the registry, don't just flip a bool.
- **Registry** in RemoteAudioService: `Map<publisherClientId, {stream, el}>`. `addPublisher(id,stream)` / `removePublisher(id)` with the EXACT ordered sequence in consensus-r4-registry.md ("The registry" section + opus-verdict-r6.md Q2). 
- **B13**: element created with NO `autoplay` attribute (keep `playsinline`, `data-remote-audio`); the SERVICE calls `el.play()` exclusively AFTER srcObject+volume+mute+setSinkId.
- **B9**: `setSinkId(selected)` applied BEFORE play.
- **B1/B3**: `el.volume = mutedAll ? 0 : min(volume,1)`, `el.muted = mutedAll`; setVolume/setMutedAll iterate the registry; cap slider/MAX_VOLUME to 1.0 (B15 too: migrate stored >1 to 1 on startup).
- **B17/B21**: addPublisher/removePublisher DRIVEN by the existing `syncPeers(this.peers())` effect (room.page.ts:635) as a diff; "changed" = clientId same AND (stream identity OR current live audio-track id changed) — reuse `currentAudioTrack` logic (remote-audio.service.ts:660).
- **B12**: sticky `unlocked` flag — once a real gesture unlocks, late joiners auto-play; keep the global pointerdown/click interaction-recovery (room.page.ts:2801) replaying `[data-remote-audio]`.
- **B8**: `remoteAudioBlocked` = (registry non-empty AND any element paused/blocked) — replace the mixer hasSources/outputPlaying logic (room.page.ts:650-659, 2685).
- **B14**: `clearRegistry()` (pause+srcObject=null+remove+map.clear) in reset() BEFORE clearSources() + a `disposed`/not-in-call guard in addPublisher re-checked AFTER the awaited setSinkId AND after play().
- **B18**: wrap setSinkId in `withTimeout(~2s)`; on timeout, play() anyway + log (never block play forever).
- **B19**: EVERY play() site (addPublisher/unlockAll/recovery/visibility/pageshow) has `.catch()` → set blocked.
- **B20**: keep applyMediaElementSinkWithDefaultFallback (fallback to '' default); blocked only if both fail.
- **B6/B7**: rewire recoverVoicePlayout/recoverPlayback + the existing recoverRemoteAudio('visibility') (room.page.ts:2876) + pageshow (2852) to per-element replay (don't delete them).
- **B22**: verify the controls-bar mute-all button shows a clear ON state (UI-clarity; likely already there).
- Remove the now-redundant muted "kickstart" elements (remote-audio.service.ts:552) — the registry elements replace them.
- Keep RemoteAudioService as the volume/mute/unlocked/selectedSink STATE owner (B10). Do NOT delete it.

## OUT OF SCOPE for IMPL-1 (separate batches — do NOT do here)
- IMPL-2: the SFU mid-overwrite reclaim-safe guard (sfu-client.service.ts:1753) + 2-publisher test (B5).
- IMPL-3: the B16 diagnostics payload.

## Constraints
- Frontend only. Do NOT touch backend. Do NOT change the RECORDER (it has its own AudioContext — independent; must keep working).
- Do NOT add ANY talker-limiting / active-speaker audio gating (north-star directive: everyone audible concurrently).
- Match existing code style. Tight, reviewable diff.
- Tests: add/adjust the per-module frontend specs (remote-audio.service.spec.ts etc.) for the registry behavior (addPublisher applies sink-before-play; volume/mute per element; clearRegistry on reset; sticky-unlock late-joiner; banner on paused). `cd frontend && npx tsc --noEmit` ZERO, run the touched specs, `npx ng build` green. Report exact commands + results in changes.md.
- NON-ATOMIC: this is the tightly-coupled playout mechanism (the ~5% exception) — it cannot split below this and stay demonstrable. ~50% check-in expected.

## Deliverable
- The diff. + `changes.md` (Codex-style: what/why/files/tests/commands/caveats) in this run's dir.
- Do NOT git commit unless projcore says so (3-agent: implementer no-commit; projcore + validator verify first).
- End: STATUS: DONE via the callback line.

Reply now with STATUS: PROPOSED + your file-by-file plan + the exact addPublisher ordered sequence you'll write + which specs you'll add. Wait for APPROVED-PLAN.
EOF
echo "IMPL-1 brief written: $(wc -l < plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-08/prompts/impl-1.md) lines"