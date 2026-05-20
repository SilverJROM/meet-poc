# Batch CHAT (DR-27) — Projcore Independent Validation

**Verdict: PASS — VERIFIED + DEPLOYED.**

| Check | Result |
|---|---|
| Commit | fd59ca9 (signaling chat relay + new signaling-chat.test +123, new v3-chat e2e +82, controls-bar chat button, room.page panel) |
| `npm test -w backend` | 117 passed / 1 skipped (+3 chat) |
| chat e2e | **1/1** — admitted peers exchange ephemeral chat + unread badge + XSS-safe text rendering |
| XSS-safe | no `innerHTML` in chat path (Angular interpolation) ✓ |
| Server-authoritative sender | backend uses server-known clientId/name, ignores client-supplied sender (anti-impersonation) ✓ |
| Deployed | fresh fe rebuild + clean restart, env clean, public URL 200 |
| Screenshot | chat-panel.png: "In-call chat" side panel, `host 3:02 PM / hello from host`, compose + Send |

## Requirement closure

| Req | Status |
|---|---|
| DR-27 ephemeral in-call chat | **VERIFIED** — WS relay admitted-only, no persistence (cleared on call end), side panel + unread badge, text-cap, XSS-safe |

## Next

DIAGLOG (DR-28 per-call diagnostics log) → US fix (DR-8) → EXTDEV (DR-29 external mic/cam).
