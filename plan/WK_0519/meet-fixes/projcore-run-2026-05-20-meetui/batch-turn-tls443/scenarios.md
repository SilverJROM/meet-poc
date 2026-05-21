# Batch TURN-TLS443 Scenarios

## TS-DR36-01 Cloudflare TLS 443 fallback
Given Cloudflare mints a valid TURN entry with `turns:turn.cloudflare.com:5349?transport=tcp` but no TLS 443 URL, when `/api/ice-config` returns ICE servers, then the same Cloudflare credential entry includes `turns:turn.cloudflare.com:443?transport=tcp` while retaining STUN, UDP/TCP 3478, and 5349.

## TS-DR36-02 no dead or duplicate fallback
Given Cloudflare already returns a valid `turns:...:443?transport=tcp` URL or returns malformed TURN URLs, when ICE config is normalized, then no duplicate 443 URL is added and malformed URLs do not break delivery of the original Cloudflare URLs.

## TS-DR36-03 static TURN path remains operator-controlled
Given `MEET_TURN_URLS`, `MEET_TURN_USERNAME`, and `MEET_TURN_CREDENTIAL` are set, when `/api/ice-config` is requested, then the static TURN URLs are returned exactly with their credentials. Given the static TURN env is incomplete, it is ignored and STUN fallback remains.
