# Decision: M-B2 WebRTC Mobile Trust Boundaries

## Decision

M-B2 uses the frontend-declared `mobile` field in the WebSocket `join` payload as the primary cap signal. Backend user-agent detection is telemetry only.

## UA Audit Telemetry

When `msg.mobile` is present and differs from the server-side UA regex guess, the backend logs an info line:

`[mobile-cap-audit] { roomId, clientId, declaredMobile, uaMobile, userAgent }`

The log does not alter admission. This keeps the locked Run 3 decision: client-declared platform signal wins, UA is audit-only.

## 480p Constraint Shape

Mobile video acquisition uses:

```ts
{
  width: { ideal: 854, max: 854 },
  height: { ideal: 480, max: 480 },
}
```

Desktop keeps the existing Run 1 desktop path:

```ts
{
  width: { ideal: 1280 },
  height: { ideal: 720 },
}
```

Both preflight and reacquire share the same `MediaService.videoConstraints()` helper.

## Background-Tab Location

The visibility listener lives in `room.page.ts`, not a separate service. The behavior is call-state-specific, uses `WsService` and local media state directly, and must be installed only while a mobile viewport is in call state.

The listener is best-effort. iOS may throttle background JS/WS, but when the event fires it disables local video, keeps audio, and broadcasts `media-state` so admitted peers update camera state.
