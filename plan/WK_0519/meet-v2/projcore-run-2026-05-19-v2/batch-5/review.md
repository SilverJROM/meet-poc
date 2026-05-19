# v2-B5 Self Review

Verdict: APPROVE.

The diff is scoped to B5 frontend lobby media plumbing, two reusable components, and Playwright coverage. Backend, signaling, recording, Settings, and the in-call grid/control overhaul were not changed.

Risk areas checked:
- `join()` reuses `media.localStream()` when preflight has already succeeded.
- `getLocalStream()` preserves backward compatibility by acquiring only if no active stream exists.
- Device changes and camera checkbox changes reacquire the stream through one service path.
- Permission-denied UI is intentionally minimal but includes Retry and blocks Join.
- B3 and B4 routed-shell regressions still pass.

Residual caveat:
- Test-mic playback is deferred. The B5 mic meter proves input activity and keeps the lobby media plumbing lean for B6-B8.
