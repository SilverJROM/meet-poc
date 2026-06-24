# Batch B3b — Scenarios

| ID | Scenario | Expected | Status |
|----|----------|----------|--------|
| S1 | Login: empty email + TG icon click | Prompt to fill email; no `/start` call | ✅ UI proof |
| S2 | Login: email + TG icon, `{eligible:false}` | "You must activate passwordless login in the app."; no number | ✅ UI proof |
| S3 | Login: email + TG icon, eligible | `displayNumber` shown; poll `/status`; `/complete` on approved → redirect | ✅ implemented |
| S4 | Login: denied/expired challenge | Clear panel; retry allowed | ✅ implemented |
| S5 | Login: password form unchanged | Email/password submit still works | ✅ no regression to form |
| S6 | Settings: TG not linked | "Link Telegram first" in passwordless panel | ✅ implemented |
| S7 | Settings: linked, off | Enable → enroll test number → poll → verify-activate → active | ✅ BE tests |
| S8 | Settings: active | Toggle shows active; disable requires password + session wipe | ✅ BE tests |
| S9 | Settings panel always shown | Passwordless section visible regardless of link state | ✅ UI proof |