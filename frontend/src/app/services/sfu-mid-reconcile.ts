/**
 * Pure helper for reconciling subscribed track mid entries after SDP renegotiation.
 *
 * CF returns mid:"" for remote-subscribe tracks — real mids only appear in the negotiated
 * SDP. When subscribing to audio+video together, CF returns mid:"" for BOTH, so keying by
 * rt.mid would collide (last entry overwrites earlier ones). This helper matches
 * responseTracks[i] ↔ newTransceiverMids[i] positionally, then validates that the
 * receiver kind on the transceiver matches the requested track kind. If Cloudflare
 * changes ordering, fail loudly so the subscribe retry path can recover.
 */
export function reconcileSubscribedMids(
  responseTracks: { trackName: string; mid: string }[],
  newTransceiverMids: string[],
  transceivers: RTCRtpTransceiver[],
  trackKindMap: Map<string, string>,
  publisherClientId: string,
): { realMid: string; publisherClientId: string; trackName: string; kind: string }[] {
  if (responseTracks.length !== newTransceiverMids.length) {
    console.warn('[sfu] subscribe reconcile failed: response track count did not match new transceiver mid count', {
      publisherClientId,
      responseTrackCount: responseTracks.length,
      newTransceiverMidCount: newTransceiverMids.length,
      responseTracks,
      newTransceiverMids,
    });
    throw new Error('[sfu] subscribe reconcile failed: track/mid count mismatch');
  }

  const result: { realMid: string; publisherClientId: string; trackName: string; kind: string }[] = [];
  for (let i = 0; i < responseTracks.length; i++) {
    const rt = responseTracks[i];
    const realMid = newTransceiverMids[i];
    const kind = trackKindMap.get(rt.trackName);
    const transceiver = transceivers.find((candidate) => candidate.mid === realMid);
    const receiverKind = transceiver?.receiver.track.kind ?? null;
    const expectedReceiverKind = kind === 'screen' ? 'video' : kind;
    if (!kind || receiverKind !== expectedReceiverKind) {
      console.warn('[sfu] subscribe reconcile failed: response track kind did not match receiver kind', {
        publisherClientId,
        trackName: rt.trackName,
        expectedKind: kind ?? null,
        expectedReceiverKind: expectedReceiverKind ?? null,
        receiverKind,
        realMid,
      });
      throw new Error('[sfu] subscribe reconcile failed: track kind mismatch');
    }
    result.push({ realMid, publisherClientId, trackName: rt.trackName, kind });
  }
  return result;
}
