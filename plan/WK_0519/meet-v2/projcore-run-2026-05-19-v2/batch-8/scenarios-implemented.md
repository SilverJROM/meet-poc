# v2-B8 Scenarios Implemented

| Scenario | Result | Evidence |
|---|---|---|
| S8.1 Host opens sidebar and sees admitted + waiting participants | PASS | `sidebar-host-open.png`; B8 Playwright |
| S8.2 Non-host sidebar hides Waiting to join | PASS | `sidebar-non-host-open.png`; B8 Playwright |
| S8.3 Host mutes participant | PASS | Target mic track disabled; host sees mute icon |
| S8.4 Host removes participant | PASS | Guest navigates away; host tile count drops |
| S8.5 Host Leave opens confirm dialog | PASS | `leave-dialog-visible.png`; non-host leave has no dialog |
| S8.6 End-for-all flushes recording before meeting-ended | PASS | Upload response file exists; host navigates |
| S8.7 Guest sees meeting-ended toast after host end | PASS | `meeting-ended-toast.png` |
| S8.8 Meeting-ended toast auto-dismisses | PASS | Guest navigates within 8s |
| S8.9 Active-speaker highlight runs at 8 Hz | PASS | `active-speaker-highlight.png`; `activeSpeakerHz` in [6,10] |

## Test Location

`e2e/tests/v2-b8-sidebar/sidebar-actions-leave-speaker.spec.ts`
