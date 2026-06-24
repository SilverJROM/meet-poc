# Batch B4 — Scenarios

## R4.1 — Cam off + image background
- **Given** a peer has `background.kind === 'image'` with a built-in id (e.g. `city`)
- **When** camera is off (`showVideo()` false)
- **Then** tile shows the background image as a cover backdrop (not solid avatar color)

## R4.2 — Upper initials
- **Given** cam-off tile with image backdrop
- **Then** initials appear top-left in a contrast chip/scrim (e.g. `JO`)

## R4.3 — Fallback avatar
- **Given** `background.kind` is `none` or `blur`, or remote peer has custom/acct background
- **When** camera is off
- **Then** centered solid-color avatar circle (unchanged behavior)

## R4.4 — Scope B broadcast
- **Given** two participants in a room
- **When** peer A selects built-in image bg and turns camera off
- **Then** peer B's tile for A shows the same built-in backdrop + upper initials
- **And** custom-uploaded backgrounds: A's self-view shows custom; B sees fallback avatar

## R4.5 — No regression
- Live video, cam-on MediaPipe compositing, mic/host/quality/reaction overlays unchanged