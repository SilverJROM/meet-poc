---
date: 2026-05-20
type: bug-batch + feature-request
status: in-progress
agent: projcore
qa_verification: per-DR in projcore-run-2026-05-20-conn (req-matrix); device confirms pending from JROM
---

# Meet real-device connection + UX issues (projcore-run-2026-05-20-conn)

Real-device testing (Chrome/macOS, iPad) surfaced a stream of connection + UX issues. Tracked as DR-* in `plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/og-requirements.md`.

## Delivered / verified
- DR-4 ICE-restart, DR-5 TURN relay (Cloudflare, live), DR-6 quick-join, DR-7→DR-12 join validation/popout, DR-9 live knockers, DR-10 doorbell, DR-1 screen-share helper, DR-2 diagnostics+force-relay, DR-3 WS-reconnect+token, DR-11 voice-first/audio-priority, DR-13 audio invariant.

## In flight / queued
- DR-14/15 (clickable rooms + name/custom URLs) — E1 building.
- DR-16 (host open/close + waiting room) — E2 queued.

## New 2026-05-20 (JROM verbatim) — questions answered, queued (F/G)
> "view is inverted on the video, can we re-invert this ... right is right and left is left on the perspective of the user." → **DR-17** remove all mirroring (true everywhere).
> "disconnects easily ... 1-2 mins free reconnect if he was previously connected ... no need to re-admit" → **DR-18** silent sticky reconnect (ties to DR-3 token not firing on real drops).
> "disconnect adds additional view on the app ... always just show the view of the existing viewers" (screenshot: 6 tiles, 4 FAILED/DISCONNECTED ghosts) → **DR-19** no ghost tiles; same root cause as DR-18.
> "sharing the video is changing fast make it not change on top ... refresh of this like 5secs so its not dizzying" → **DR-20** stable speaker order + ~5s settle.

JROM answers: no mirroring anywhere; keep tile as-is + reconnect silently; stable order + ~5s settle.

## Open
- DR-8 cross-network field-proof (TURN relay live) — JROM PH↔US live re-test.
- Known test-infra item: live-DB data-seed specs have a cross-connection FK/WAL flake (validate gates on clean DB).
