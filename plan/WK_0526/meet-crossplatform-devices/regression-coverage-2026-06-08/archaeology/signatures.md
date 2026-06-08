# Diagnostics Archaeology — distinct failure signatures

Sessions analyzed: 48 | with >=1 signature: 35

## Distinct signatures (signature — #sessions — examples)

- **inbound-audio-recv-no-audioLevel/energy** — 30 — e.g. 01ec650a, 2579eb8f, 2b124519, 35f6324a, 3d520a8b, 45197347
- **inbound-audio-high-concealment** — 27 — e.g. 01ec650a, 11ee886f, 2579eb8f, 2b124519, 35f6324a, 3d520a8b
- **inbound-audio-packet-loss** — 17 — e.g. 2579eb8f, 2b124519, 35f6324a, 4db00a37, 7a472bdf, 88c5dcf4
- **relay-path-used** — 9 — e.g. 0794bbad, 45197347, 5d9ec218, 8fb522ad, 95b38671, b0019fb6
- **subscribe-stuck-no-firstframe** — 4 — e.g. 01ec650a, 2b124519, 35f6324a, dd0b5dd6
- **ws-reconnect** — 4 — e.g. 2579eb8f, 35f6324a, ae0d1932, b0019fb6
- **ws-disconnect** — 3 — e.g. 35f6324a, ae0d1932, b0019fb6
- **one-inbound-audio-at-a-time(>=2 pubs never concurrent)** — 2 — e.g. 11ee886f, 5d9ec218
- **high-RTT-intl(>=150ms)** — 2 — e.g. 5d515505, e727a2e7
- **outbound-audio-0bytes** — 1 — e.g. 01ec650a
- **pc-state-bad:failed/failed** — 1 — e.g. 01ec650a
- **publish-error** — 1 — e.g. 0467a8c7
- **inbound-audio-recv-audioLevel-0** — 1 — e.g. 11ee886f

## Per-session signature map (recent first)

- 11ee886f (06-08 00:27): inbound-audio-high-concealment, inbound-audio-recv-audioLevel-0, one-inbound-audio-at-a-time(>=2 pubs never concurrent)
- 5d515505 (06-05 01:40): high-RTT-intl(>=150ms), inbound-audio-high-concealment, inbound-audio-recv-no-audioLevel/energy
- e727a2e7 (06-05 00:54): high-RTT-intl(>=150ms), inbound-audio-high-concealment, inbound-audio-recv-no-audioLevel/energy
- 89341938 (06-04 16:05): inbound-audio-recv-no-audioLevel/energy
- 01ec650a (06-04 11:53): inbound-audio-high-concealment, inbound-audio-recv-no-audioLevel/energy, outbound-audio-0bytes, pc-state-bad:failed/failed, subscribe-stuck-no-firstframe
- d1b212ac (06-04 11:48): inbound-audio-high-concealment, inbound-audio-recv-no-audioLevel/energy, relay-path-used
- 45197347 (06-02 11:51): inbound-audio-high-concealment, inbound-audio-recv-no-audioLevel/energy, relay-path-used
- 5d9ec218 (06-02 03:56): inbound-audio-high-concealment, inbound-audio-recv-no-audioLevel/energy, one-inbound-audio-at-a-time(>=2 pubs never concurrent), relay-path-used
- b35a94c9 (06-01 23:36): inbound-audio-high-concealment, inbound-audio-packet-loss, inbound-audio-recv-no-audioLevel/energy
- e233afb6 (05-29 11:56): inbound-audio-high-concealment, inbound-audio-recv-no-audioLevel/energy
- 3d520a8b (05-29 11:27): inbound-audio-high-concealment, inbound-audio-recv-no-audioLevel/energy
- 0467a8c7 (05-29 11:25): publish-error
- 94d08bc0 (05-29 07:38): inbound-audio-high-concealment, inbound-audio-packet-loss, inbound-audio-recv-no-audioLevel/energy
- 7a472bdf (05-29 07:29): inbound-audio-high-concealment, inbound-audio-packet-loss, inbound-audio-recv-no-audioLevel/energy
- b0019fb6 (05-29 01:22): relay-path-used, ws-disconnect, ws-reconnect
- ba673711 (05-29 00:01): inbound-audio-high-concealment, inbound-audio-recv-no-audioLevel/energy
- 88c5dcf4 (05-28 22:56): inbound-audio-high-concealment, inbound-audio-packet-loss, inbound-audio-recv-no-audioLevel/energy
- ae0d1932 (05-28 22:55): ws-disconnect, ws-reconnect
- f32a87fe (05-28 21:27): inbound-audio-high-concealment, inbound-audio-packet-loss, inbound-audio-recv-no-audioLevel/energy
- 0794bbad (05-28 21:20): relay-path-used
- 2579eb8f (05-28 14:03): inbound-audio-high-concealment, inbound-audio-packet-loss, inbound-audio-recv-no-audioLevel/energy, ws-reconnect
- 35f6324a (05-28 13:59): inbound-audio-high-concealment, inbound-audio-packet-loss, inbound-audio-recv-no-audioLevel/energy, subscribe-stuck-no-firstframe, ws-disconnect, ws-reconnect
- d44fce6d (05-28 12:59): inbound-audio-high-concealment, inbound-audio-recv-no-audioLevel/energy
- 7da662ad (05-28 10:37): inbound-audio-high-concealment, inbound-audio-recv-no-audioLevel/energy
- 8fb522ad (05-28 09:33): inbound-audio-high-concealment, inbound-audio-packet-loss, inbound-audio-recv-no-audioLevel/energy, relay-path-used
- 4db00a37 (05-28 09:11): inbound-audio-high-concealment, inbound-audio-packet-loss, inbound-audio-recv-no-audioLevel/energy
- c7a80dc1 (05-28 09:00): inbound-audio-high-concealment, inbound-audio-packet-loss, inbound-audio-recv-no-audioLevel/energy, relay-path-used
- 95b38671 (05-28 08:46): inbound-audio-high-concealment, inbound-audio-packet-loss, inbound-audio-recv-no-audioLevel/energy, relay-path-used
- b378b642 (05-28 08:45): inbound-audio-high-concealment, inbound-audio-packet-loss, inbound-audio-recv-no-audioLevel/energy, relay-path-used
- b5610386 (05-28 08:30): inbound-audio-high-concealment, inbound-audio-packet-loss, inbound-audio-recv-no-audioLevel/energy
- 2b124519 (05-28 07:28): inbound-audio-high-concealment, inbound-audio-packet-loss, inbound-audio-recv-no-audioLevel/energy, subscribe-stuck-no-firstframe
- dd0b5dd6 (05-28 07:15): inbound-audio-high-concealment, inbound-audio-packet-loss, inbound-audio-recv-no-audioLevel/energy, subscribe-stuck-no-firstframe
- d216b499 (05-28 03:34): inbound-audio-packet-loss, inbound-audio-recv-no-audioLevel/energy
- 89fb1f8c (05-27 23:47): inbound-audio-recv-no-audioLevel/energy
- f8fbd5ca (05-27 12:05): inbound-audio-packet-loss, inbound-audio-recv-no-audioLevel/energy
