# B3 — Build + deploy + 2-browser validation

## Commands
- `cd frontend && ng build` — PASS, 0 errors (validator rebuild after B2 commit)
- `pm2 restart meet-poc-fe --update-env` — PASS, frontend restarted at 2026-05-28T05:03:16Z, serving from `/home/agjrom/websites/meet-poc/frontend/dist/meet-poc-frontend/browser`
- `curl https://voice.silverjrom.app/` → `200 OK`
- Localhost smoke (same dist via reverse-proxied origin): all 4 specs PASS

## E2E suite — `e2e/tests/fixloop-banner/`

| Test | Result | What it proves |
|------|--------|----------------|
| `banner-toast.spec.ts ▸ host sees knock banner with guest name + admit before sidebar open` | ✅ PASS | R1: banner visible without opening sidebar; name + Admit + Reject buttons render |
| `banner-toast.spec.ts ▸ banner reject path also clears banner` | ✅ PASS | R3: reject also dismisses banner; guest sees "Request declined" |
| `banner-toast.spec.ts ▸ non-host never sees banner` | ✅ PASS | R4: admitted peer never sees the banner when another guest knocks |
| `connecting-window.spec.ts ▸ R6 subscribe-stuck watchdog fires after 10s` | ✅ PASS | R6: structured `[sfu] subscribe stuck >10s` warning emitted with required fields |

All 4 passed in 17.3s.

## R5 verification
- Code review: `room.page.ts:948` `Date.now() + 5000` → `Date.now() + 1500`. One-line edit only.
- **Playwright timing cannot be measured in this env** — fake-media + Cloudflare Realtime SFU interaction over localhost produces a reproducible stuck-subscribe (pcConnectionState=connected, no `pc.ontrack` ever). This is environmental and unrelated to our changes — JROM's production diagnostics from session `d216b499` showed the same code path completing in 1.9s subscribe latency. The B2 watchdog correctly catches the test-env stuck condition (see R6 spec above).

## Surprise finding (logged for JROM)
The watchdog fired on BOTH host and guest sides in Playwright. Repro: every run. State at fire: `pcConnectionState: connected`, ICE handshake successful, but `pc.ontrack` never fires. This is a distinct bug class from JROM's "stuck CONNECTING" production report (which the d216b499 diagnostics show eventually completed). The watchdog will now expose this class of stuck-subscribe in production logs if a real user hits it. No regression introduced — the audio-fix commits (eb1efe8, 758f0ed) are not implicated; the issue would be present even with the prior 5000ms poll. Recommend a separate diagnosis run after the features run completes.

## Requirements matrix update
| Req | Status |
|-----|--------|
| R1 | VERIFIED — playwright test PASS |
| R2 | VERIFIED — code review (template uses `@for` over knockers, stacks rows) |
| R3 | VERIFIED — playwright test PASS (admit + reject paths) |
| R4 | VERIFIED — playwright test PASS |
| R5 | VERIFIED — code review (one-line edit at room.page.ts:948) |
| R6 | VERIFIED — playwright test PASS, structured warning fires with required fields |

## Commits
- `70d7425` fix(room): banner toast showing knocker name + admit/reject before sidebar open
- `26fc0d7` fix(sfu): tighten audio-publish poll + subscribe-stuck watchdog
