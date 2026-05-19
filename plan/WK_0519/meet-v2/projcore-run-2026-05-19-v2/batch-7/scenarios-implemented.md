# v2-B7 Scenarios Implemented

| Scenario | Status | Evidence |
|---|---|---|
| S7.1 Record hidden for non-host | PASS | `controls-banner-failure.spec.ts`; `screenshots/non-host-controls-no-record.png` |
| S7.2 Record visible for host | PASS | `controls-banner-failure.spec.ts`; `screenshots/host-controls-record-visible.png`; live screenshot |
| S7.3 Recording banner visible to all | PASS | `controls-banner-failure.spec.ts`; `screenshots/recording-banner-visible.png` |
| S7.4 Permission denied error UI | PASS | `controls-banner-failure.spec.ts`; `screenshots/permission-denied-polished.png` |
| S7.4 No-devices error UI | PASS | `controls-banner-failure.spec.ts`; `screenshots/no-devices-polished.png` |
| S7.5 Icon-state controls have aria-pressed | PASS | `controls-banner-failure.spec.ts` |
| S7.5 Local camera-off tile renders avatar | PASS | `controls-banner-failure.spec.ts`; `screenshots/self-camera-off-avatar.png` |

Notes:

- The B7 suite is intentionally serial because these tests create and delete rooms/recordings against the shared live SQLite DB.
- The public live smoke captured `screenshots/live-host-controls-record-visible.png` from `https://voice.silverjrom.app`.
