# Batch MUI Scenarios

## DR-26.1 Control Bar Restyle And Wiring
- Given an admitted host is in-call, the call surface uses a dark Meet-like bottom control layout.
- The left bottom corner shows elapsed time and meeting title/code.
- The center controls expose mic, camera, share screen, record, settings, audio-only, diagnostics, and leave.
- Mic and camera preserve their existing handlers and show red/off styling when disabled.
- Device chevrons and settings preserve the existing device dialog handler.
- Diagnostics opens the existing diagnostics panel, including the existing Force relay toggle.
- Audio-only toggles the existing manual audio-only state.
- Leave opens the existing leave dialog.

## DR-26.2 Bottom Right Tools
- Given a user is in-call, the bottom-right tool cluster shows info, chat, and people icons.
- Info uses the existing diagnostics action.
- Chat is visibly disabled/inert until DR-27.
- People opens and closes the existing participant sidebar, including waiting-room badges/counts.

## DR-26.3 Video Tile States
- Tiles keep existing stream rendering.
- A camera-off participant shows initials on a colored gradient avatar.
- A muted participant shows the muted mic indicator.
- Active speaker state shows a visible outline on the tile.
- Labels remain bottom-left and connection state remains available for existing tests.

## DR-26.4 Share Layout
- The existing presenter-main plus participant-strip share layout remains wired.
- The presenter tile is visually dominant.
- Participant tiles are restyled as a dark side strip and retain collapse behavior.

## DR-26.5 Mobile Reachability
- On narrow screens, no approved primary control disappears.
- The bottom control rail scrolls horizontally so mic, camera, share, settings, diagnostics, audio-only, and leave remain reachable.
