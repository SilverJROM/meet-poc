# Batch MUI (DR-26) — Projcore Validation

**Verdict: PASS — VERIFIED + DEPLOYED (post-freeze).**

## Post-freeze completion (2026-05-20)

- Deployed: fresh fe rebuild + clean restart (env clean, no /tmp leak), public URL 200, TURN live.
- Restyle confirmed via screenshot: Meet-like dark call surface — rounded tile (HOST badge + mute indicator + initials avatar + name label), bottom control bar (mic/camera/share/settings/captions/speaker/diagnostics/leave) + meeting clock + info/chat icons. ~80-90% Meet feel, own Ionicons.
- iter1 send-back (test-only): codex fixed the mui spec stale-locator bug + updated drifted b4-call-ui sibling selectors (Leave→"Leave call" etc.). Commit 64ec2eb.
- Independent re-run: mui spec **4/4**; b4-call-ui **8/8** (the 2 ECONNREFUSED:4710 fails are the recurring hardcoded-port test-config issue — both PASS with E2E_WS_ORIGIN set; not MUI, not the app); gate 96/96 (codex).
- All control handlers preserved (mute/camera/screen/record/sidebar/diagnostics/audioOnlyToggle/devices/leave), chat placeholder disabled. JROM visual sign-off pending (live).

## Known test-infra item (recurring, not blocking)

Hardcoded `:4710` WS/base-URL fallback in several specs (DIAGI device-switch + b4-call-ui peer-warning/room-full) → ECONNREFUSED unless E2E_WS_ORIGIN/E2E_BASE_URL is set. Recommend a test-infra cleanup pass to parameterize these to the config baseURL. Test-only; app unaffected.

---

## (original partial verdict — under call-freeze)

**Was: code-VERIFIED. Visual check + e2e + DEPLOY DEFERRED to freeze-lift.**

## Done now (read-only, no live impact during JROM's call)

| Check | Result |
|---|---|
| Commit | b972c01 (controls-bar + tile + room.page restyle, new mui spec 196 LOC) |
| Control wiring preserved | ALL emit handlers intact: mute/camera/screen/record/audioOnlyToggle/diagnostics(×2)/leave/sidebar + devices(×3 chevrons). Reskin not rewrite ✓ |
| Icon source | ion-icon only (13 uses); NO google/gstatic/proprietary asset refs ✓ |
| Chat placeholder | `disabled` (inert, per guardrail) ✓ |
| mui spec | 51 real DOM calls (good coverage) |
| Existing-spec edits | honest selector/label updates (e.g., "Camera on"→"Turn camera off"); assertions preserved ✓ |
| codex: backend 114/1-skip + builds | PASS |

## DEFERRED to freeze-lift

- Run mui e2e + Run-1/diag regression on clean DB.
- Capture screenshots (call-controls, tiles-states, share-layout) for JROM visual confirm vs the Meet reference.
- Rebuild frontend + clean pm2 deploy (env-safe) + smoke.
- JROM visual sign-off on the ~80-90% Meet look/feel + dark call surface.

## On freeze-lift

Quick sequence: e2e + screenshots → deploy → JROM visual check → mark VERIFIED → dispatch CHAT (DR-27).
