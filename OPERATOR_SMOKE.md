# Run 3 Mobile Operator Smoke

Purpose: give JROM one deterministic real-device checklist for the final mobile acceptance gate. Codex prepared the artifacts; JROM executes the physical-device checks.

Target URL: `https://voice.silverjrom.app`

Required devices:
- iPhone running Safari.
- Android phone running Chrome.
- Optional desktop browser for host-side observation.

Checklist:

1. Open `https://voice.silverjrom.app/login` on iPhone Safari and Android Chrome.
2. Sign in as the JROM account on both devices.
3. Open `/app/rooms` and confirm the sidebar shell is usable without horizontal scroll.
4. Open `/app/ongoing`, `/app/past`, `/app/recordings`, `/app/transcripts`, and `/app/settings`; confirm each tab fits the viewport and the sidebar is collapsed by default on mobile.
5. Open the `TEST_ROOM01` room link on iPhone Safari.
6. On the iPhone lobby, confirm the address bar and safe-area insets do not cover the preview, join controls, or bottom controls.
7. Confirm the lobby shows the `Tap to enable mic preview` pill before mic-meter activation.
8. Tap the mic-preview pill on iPhone; confirm the mic meter animates after the gesture.
9. Use the camera switch button on iPhone; confirm the preview stays visible and the control remains reachable.
10. Join the call from iPhone as the host.
11. Open the same `TEST_ROOM01` room link on Android Chrome, enter a different participant name, and request/join the same call.
12. Keep both devices in the same call for at least 2 minutes; confirm audio continues, video remains stable, and the meeting clock increments.
13. On each phone, open participants; confirm the mobile bottom sheet reaches about 75dvh, dismisses by drag/backdrop, and does not collide with the keyboard.
14. As host, verify recording controls are host-only, the recording banner is visible to everyone while recording, and host end/leave options are distinct.
15. End the meeting as host; confirm the non-host device sees the meeting-ended toast and cannot remain in an orphaned call.

Capture requested from JROM:
- One iPhone Safari screenshot of lobby before tapping mic preview.
- One iPhone Safari screenshot of lobby after tapping mic preview.
- One iPhone Safari screenshot during the 2-minute call.
- One Android Chrome screenshot during the same 2-minute call.
- Notes for any address-bar, keyboard, or safe-area overlap.

Operator-only acceptance gates:
- R6.5: real-device address bar and safe-area behavior accepted by JROM.
- R7.1: iPhone Safari and Android Chrome simultaneous smoke accepted by JROM.
- R7.3: real two-device, two-minute call accepted by JROM.
- R7.5: final JROM signoff recorded.
