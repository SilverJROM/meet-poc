# B6a Changes — Publisher simulcast: camera video with h/m/l RID sendEncodings (SR-6 part 1)

## Summary

Camera video is now published to the SFU with three simulcast RID encodings (high/medium/low). The SFU can forward a per-receiver-appropriate quality layer to each subscriber. Screenshare remains single-encoding. B6b (subscriber layer selection via preferredRid/ridNotAvailable) is not included here.

## Files changed

### `frontend/src/app/services/sfu-client.service.ts`

**New constant:**
```typescript
const VIDEO_SIMULCAST_ENCODINGS: RTCRtpEncodingParameters[] = [
  { rid: 'h', scaleResolutionDownBy: 1, maxBitrate: 1_200_000 },
  { rid: 'm', scaleResolutionDownBy: 2, maxBitrate: 400_000 },
  { rid: 'l', scaleResolutionDownBy: 4, maxBitrate: 120_000 },
];
```

**`doPublish` — camera transceiver paths updated (both):**

Camera-on path:
```typescript
this.pc.addTransceiver(videoTrack, { direction: 'sendrecv', sendEncodings: VIDEO_SIMULCAST_ENCODINGS })
```

Camera-off (pre-negotiated) path:
```typescript
this.pc.addTransceiver('video', { direction: 'sendrecv', sendEncodings: VIDEO_SIMULCAST_ENCODINGS })
```

Both paths set `sendEncodings` up-front. For the camera-off case this ensures the simulcast encodings persist on the sender so `replaceTrack` (camera-on later) inherits them without renegotiation (same reasoning as the DR-55/F2 pre-negotiation).

**New public method:**
```typescript
getVideoEncodings(): RTCRtpEncodingParameters[] {
  return this.videoSender?.getParameters().encodings ?? [];
}
```
Exposed for the `sfuVideoEncodings` debug hook and e2e assertions.

**Screenshare unchanged:** `doPublishScreen` uses `addTransceiver(displayTrack, { direction: 'sendrecv' })` with no `sendEncodings` — single encoding.

### `frontend/src/app/pages/room/room.page.ts`

Added `sfuVideoEncodings` debug hook (localhost-only):
```typescript
debug.sfuVideoEncodings = () => this.sfuClient.getVideoEncodings();
```
And the corresponding type declaration on `Window['__meetDebug']`.

### `e2e/tests/sfu-b6a-simulcast/sfu-simulcast.spec.ts` (new)

Two-assertion simulcast e2e (fake media + `?sfu=1`, isolated ports/DB):

- **Assertion A** — `sfuVideoEncodings()` returns 3 encodings with rids `['h', 'l', 'm']` (sorted).
- **Assertion B** — outbound-rtp shows ≥ 1 video stream after publish (simulcast active; layers may vary in headless).
- **Assertion C** — 2-client regression: B receives A's simulcast video (`framesDecoded > 0`), A receives B's.

## Test results

```
✓ B6a: camera video published with simulcast encodings (h/m/l); 2-client regression (video flows) (10.3s)
1 passed (23.9s)
```

B4a regression:
```
✓ B4a: two SFU clients each receive audio+video from the other through Cloudflare (8.1s)
1 passed (19.4s)
```

## Commit

`5524097` — feat(sfu): publisher simulcast — camera video with h/m/l RID sendEncodings (SR-6, B6a)
