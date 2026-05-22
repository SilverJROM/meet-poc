/**
 * Pure helper for reconciling subscribed track mid entries after SDP renegotiation.
 *
 * CF returns mid:"" for remote-subscribe tracks — real mids only appear in the negotiated
 * SDP. When subscribing to audio+video together, CF returns mid:"" for BOTH, so keying by
 * rt.mid would collide (last entry overwrites earlier ones). This helper matches
 * responseTracks[i] ↔ newTransceiverMids[i] positionally (CF adds transceivers in request
 * order) and builds entries with real mids only.
 */
export function reconcileSubscribedMids(
  responseTracks: { trackName: string; mid: string }[],
  newTransceiverMids: string[],
  trackKindMap: Map<string, string>,
  publisherClientId: string,
): { realMid: string; publisherClientId: string; trackName: string; kind: string }[] {
  const count = Math.min(responseTracks.length, newTransceiverMids.length);
  const result: { realMid: string; publisherClientId: string; trackName: string; kind: string }[] = [];
  for (let i = 0; i < count; i++) {
    const rt = responseTracks[i];
    const realMid = newTransceiverMids[i];
    const kind = trackKindMap.get(rt.trackName) ?? 'unknown';
    result.push({ realMid, publisherClientId, trackName: rt.trackName, kind });
  }
  return result;
}
