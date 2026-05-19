# context-handoff.md — meet-poc v3 mobile Run 3

---

## Pre-M-B1 handoff (Run 3 start)

**HEAD at run start:** `feat/meet-v2-b8-sidebar-actions-leave-speaker` (commit `5210993 docs: add B8 evidence and run tracking`) — v2 Run 1 final commit. v2 ACCEPTED 44/44. Clean tree.
**Branch for M-B1:** `feat/meet-v3-mb1-foundations` — off the v2-B8 HEAD.

**What's in the repo now (post-v2 Run 1):**
- Backend: 17 vitest / 43 tests green. 5 modules (auth, rooms, signaling, recording, sessions). Full WS protocol incl. media-state, recording-state, meeting-ended-by-host, mute-target, remove-peer.
- Frontend: Angular 20 SPA at `/app/*` with 6 sidebar tabs. Lobby has pre-grant + mic-meter + device selectors. Call view has dynamic grid + per-tile overlays + meeting clock + icon-state controls + host-only Record + recording banner + polished device-failure UX + participant sidebar + host kebab actions + leave-confirm dialog + meeting-ended toast + active-speaker.
- Live: voice.silverjrom.app serves the full v2 stack.
- 100vh used in 4+ places. Zero touch handlers. No PWA. No mobile media queries beyond cosmetic Run 1 leftovers. No `isMobile()` signal. No bottom-sheet anywhere.

**WS protocol available (post-v2 Run 1):** all v2 messages live. **M-B5 adds** a UA-detection check at backend `join` for mobile peer-cap enforcement.

**What M-B1 must produce (mobile foundations):**

1. **Viewport units migration (R1.1):**
   - Audit: `grep -rE "100vh|100lvh|100svh" frontend/src/app/**/*.scss frontend/src/styles.scss frontend/src/app/**/*.ts`
   - Replace each with `100dvh` (dynamic viewport — adjusts for iOS Safari address bar)
   - Where browsers without `dvh` support matter, use the two-line fallback pattern: `min-height: 100vh; min-height: 100dvh;`
   - Document any case where a non-dvh unit is intentionally retained

2. **48px touch-target audit (R1.2):**
   - Audit every interactive control's rendered size at mobile viewport
   - Buttons, links-as-buttons, icon controls, kebab menus, sidebar toggle, leave-dialog buttons, lobby device selector dropdowns
   - Apply CSS to ensure `min-width: 48px; min-height: 48px` on mobile (use a shared mixin)
   - Desktop sizes preserved (current cosmetic styles win when desktop)

3. **Breakpoint system (R1.3):**
   - New `frontend/src/styles/_breakpoints.scss` partial with variables + mixins:
     ```scss
     $mobile-max: 1023px;
     $desktop-min: 1024px;
     @mixin mobile { @media (max-width: #{$mobile-max}) { @content; } }
     @mixin desktop { @media (min-width: #{$desktop-min}) { @content; } }
     ```
   - Import in `styles.scss`
   - Audit existing media queries; convert any RAW `@media` to the mixin form. Document any deliberate exceptions.

4. **`isMobile()` signal (R1.4):**
   - New `frontend/src/app/services/viewport.service.ts`:
     ```typescript
     @Injectable({ providedIn: 'root' })
     export class ViewportService {
       readonly isMobile = signal(window.innerWidth < 1024);
       constructor() {
         let timer: any;
         window.addEventListener('resize', () => {
           clearTimeout(timer);
           timer = setTimeout(() => this.isMobile.set(window.innerWidth < 1024), 250);
         });
       }
     }
     ```
   - Expose via `__meetDebug.isMobile = () => viewportService.isMobile()` for S1.4 spec
   - Use the signal in any new conditional rendering (later batches consume it)

5. **Desktop regression spec (R1.5 + R8.1 + R8.2):**
   - `e2e/tests/v3-mb1-foundations/foundations-mobile.spec.ts` — S1.1-S1.4 at 390×844 viewport
   - `e2e/tests/v3-mb1-foundations/foundations-desktop-regression.spec.ts` — full Run 1 specs at 1920×1080 must remain green; verify `isMobile()` returns false; verify NO mobile-specific layout artifacts present at desktop

6. **At gate, MANDATORY:**
   - Run FULL Run 1 desktop e2e: `tests/v2-b3-shell + tests/v2-b4-tabs + tests/v2-b5-lobby + tests/v2-b6-grid + tests/v2-b7-controls + tests/v2-b8-sidebar` with `--workers=1`. **40/40 must PASS.**
   - Run M-B1 specs at mobile viewport
   - `npm test -w backend` — 43/43 unchanged (no backend changes in M-B1)

**Standing flags (all carried from v2 + tightened for Run 3):**
- **Commit BEFORE STATUS: DONE.** This was broken twice in v2 (B6 + B8 false alarm). For Run 3, the dispatch brief puts this as the FIRST instruction post-persona-switch.
- §2.7a confirmation-prompt protocol — if codex hits any tool-confirmation prompt, FILE-FLAG `[projcore NEEDS-CONFIRM]` in callbacks.md BEFORE waiting. Dual-source watcher will catch missed file-flags via pane scan; not an excuse.
- §1.15 decisions/2026-05-19-v3-mb1-<slug>.md for non-trivial autonomous calls
- §2.10 real-DOM tests; no setContent smell
- **No prod-DB pollution** (carried hygiene rule); tests clean up after themselves
- **No questions to JROM during Run 3** per JROM directive. Codex makes autonomous calls per `trust-defaults.md`.

**Decisions already locked (do not re-litigate):**
- Cross-platform iOS 16+ AND Android Chrome
- Fluid responsive single SPA (no PWA, no /m/* split)
- Full parity except screen-share
- 480p mobile / 4-peer mobile-cap (per-client UA detection)
- Bottom-sheet replaces sidebar
- Background-tab keep audio / pause video
- Mobile breakpoint = `<1024px`
- Active-speaker stays from v2-B8 (already 8Hz throttled — perfect for mobile)

**Live service:** voice.silverjrom.app on PM2. Tsx-watch handles BE auto-reload; FE rebuild + `pm2 restart meet-poc-fe` needed for changes to land.

**Active callback target:** `plan/WK_0519/meet-v3-mobile/projcore-run-2026-05-19-v3-mobile/callbacks.md` + `progress.md`.
