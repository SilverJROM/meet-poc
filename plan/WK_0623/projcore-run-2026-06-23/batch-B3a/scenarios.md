# Batch B3a — Test Scenarios

## Security outcome scenarios

| # | Scenario | Expected outcome | Test |
|---|---|---|---|
| S1 | Unknown email → start | `{eligible:false}` — identical shape to all ineligible paths | ✅ eligibility suite |
| S2 | User exists but no passwordless_settings row → start | `{eligible:false}` | ✅ eligibility suite |
| S3 | User exists, tg_status=off → start | `{eligible:false}` | ✅ eligibility suite |
| S4 | User exists, status=active, no TG link → start | `{eligible:false}` | ✅ eligibility suite |
| S5 | All conditions met → start | `{eligible:true, challengeToken, displayNumber, expiresAt, pollAfterMs:2000}` | ✅ start suite |
| S6 | Challenge row persisted in DB | token_hash stored, email/tgUserId correct | ✅ start suite |
| S7 | Deferred send (setImmediate) | fetch called for sendMessage after response returns | ✅ start suite |
| S8 | 4th request in 10min window | `{eligible:false}` — same shape as ineligible | ✅ rate-limit suite |
| S9 | Rate check all-then-increment | Blocked check leaves bucket count unchanged at 3 | ✅ rate-limit suite |
| S10 | sendMessage inline keyboard | vlk: prefix, 3 buttons, all button numbers present | ✅ send suite |
| S11 | Atomic reserve-before-send | Second `sendPasswordlessChallenge` call on same challenge = 1 fetch call total | ✅ send suite |
| S12 | Missing TG_WEBHOOK_SECRET header | 401 | ✅ webhook secret suite |
| S13 | Wrong TG_WEBHOOK_SECRET header | 401 | ✅ webhook secret suite |
| S14 | Correct TG_WEBHOOK_SECRET header | 200, challenge resolved | ✅ webhook secret suite |
| S15 | Correct tap (from.id matches, correct number) | approved_at set; denied_at/consumed_at null | ✅ callback handler suite |
| S16 | Wrong tap (from.id matches, wrong number) | denied_at AND consumed_at both set; approved_at null | ✅ callback handler suite |
| S17 | Foreign from.id (spoof) | Challenge state untouched; silently acked | ✅ callback handler suite |
| S18 | Already-approved challenge tapped again | approved_at unchanged | ✅ callback handler suite |
| S19 | Expired challenge tapped | State unchanged | ✅ callback handler suite |
| S20 | Non-vlk: prefix | Ignored | ✅ callback handler suite |
| S21 | Status: fresh challenge | "pending" | ✅ status suite |
| S22 | Status: after correct tap | "approved" | ✅ status suite |
| S23 | Status: after wrong tap | "denied" | ✅ status suite |
| S24 | Status: past TTL | "expired" | ✅ status suite |
| S25 | Status response does not leak token | JSON body contains no challengeToken value | ✅ status suite |
| S26 | Complete: approved challenge | 200 + session cookie + email | ✅ complete suite |
| S27 | Complete: not approved | 400 "not approved" | ✅ complete suite |
| S28 | Complete: denied | 400 "denied" | ✅ complete suite |
| S29 | Complete: expired | 400 "expired" | ✅ complete suite |
| S30 | Complete: second call (double-complete) | 400 "already used" (changes!==1) | ✅ complete suite |

## Out of scope (B3b)
- Activation enroll/verify-activate/disable endpoints
- Login UI (TG icon, number display, polling)
- Settings activation panel
- End-to-end real Telegram tap (B3-T12 capstone)
