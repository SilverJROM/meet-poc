# Batch B4 — Test report

## Build
| Target | Command | Result |
|--------|---------|--------|
| Frontend | `npm run build` (frontend) | **PASS** — bundle green |
| Backend | `npm run build` (backend tsc) | **PASS** |

## UI proof
- Static fixture: `batch-B4/ui-proof/camoff-bg-tile.html`
- Screenshot: `batch-B4/screenshots/camoff-bg-tile.png`
- Shows city background cover + `JO` initials chip top-left + name label overlay

## Manual verification checklist
- [x] Cam-off + built-in image → backdrop + upper initials (screenshot)
- [x] Types compile across frontend + backend
- [ ] Live 2-client e2e (deferred to validator; signaling path implemented)