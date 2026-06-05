# FIX5 Scenarios

## TS-FIX5-001 - Single-report international metrics capture

Given `collectDiagnostics()` receives one `RTCStatsReport` containing candidate-pair, outbound-rtp, remote-inbound-rtp, and inbound-rtp stats, when it builds the SFU diagnostics snapshot, then it captures candidate-pair bandwidth/RTT/bytes, far-end uplink loss/RTT/jitter on outbound tracks, inbound audio level/jitter, and inbound video NACK/PLI without calling `getStats()` more than once.

## TS-FIX5-002 - Missing stats are null-safe

Given those stats are absent or omit browser-specific fields, when diagnostics are collected or rendered, then the new fields are `null` and the owner diagnostics page renders `n/a` without throwing.

## TS-FIX5-003 - Owner-only international network path readout

Given an owner views the diagnostics page, when a latest sample or timeline entry has SFU diagnostics, then the page shows an "International / Network path" block with egress IP, Cloudflare edge IP, RTT hint, band/route/relay, loss/jitter/concealment, bitrate, bytes, mic energy, and inbound audio level.

## TS-FIX5-004 - No normal call UI or collection cadence change

Given a normal user is in the call UI, when FIX5 is present, then there is no room/call template change, no new timer, no second `getStats()`, and diagnostics collection remains gated by the existing diagnostics preference/global flag and 7.5s interval.

## TS-FIX5-005 - Backend raw payload persists new fields

Given a diagnostics POST includes the new nested SFU fields, when the owner retrieves session diagnostics, then those nested fields round-trip from `payload_json` without backend source refactor or whitelisting.
