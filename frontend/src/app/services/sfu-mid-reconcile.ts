/**
 * Pure helper for reconciling subscribed track mid entries after SDP renegotiation.
 *
 * CF returns mid:"" for remote-subscribe tracks — real mids only appear in the negotiated
 * SDP. When subscribing to audio+video together, CF returns mid:"" for BOTH, so keying by
 * rt.mid would collide (last entry overwrites earlier ones). This helper matches
 * responseTracks[i] ↔ newTransceiverMids[i] positionally within each receiver kind,
 * then validates that the receiver kind on the transceiver matches the requested track
 * kind. If Cloudflare changes ordering or count parity, fail loudly so the subscribe
 * retry path can recover.
 *
 * Residual limitation: when a single publisher has multiple same-receiver-kind tracks
 * (for example camera video plus screen video), CF's empty remote mids leave ordering
 * within that kind as the only deterministic signal available here.
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

  const trackNames = new Set<string>();
  const responseByReceiverKind = new Map<string, { trackName: string; mid: string; kind: string }[]>();
  for (const rt of responseTracks) {
    if (trackNames.has(rt.trackName)) {
      console.warn('[sfu] subscribe reconcile failed: duplicate response trackName', {
        publisherClientId,
        trackName: rt.trackName,
        responseTracks,
      });
      throw new Error('[sfu] subscribe reconcile failed: duplicate trackName');
    }
    trackNames.add(rt.trackName);

    const kind = trackKindMap.get(rt.trackName);
    if (!kind) {
      console.warn('[sfu] subscribe reconcile failed: response track kind was unknown', {
        publisherClientId,
        trackName: rt.trackName,
        responseTracks,
      });
      throw new Error('[sfu] subscribe reconcile failed: unknown track kind');
    }

    const expectedReceiverKind = kind === 'screen' ? 'video' : kind;
    const byKind = responseByReceiverKind.get(expectedReceiverKind) ?? [];
    byKind.push({ ...rt, kind });
    responseByReceiverKind.set(expectedReceiverKind, byKind);
  }

  const midsByReceiverKind = new Map<string, string[]>();
  for (const realMid of newTransceiverMids) {
    const transceiver = transceivers.find((candidate) => candidate.mid === realMid);
    const receiverKind = transceiver?.receiver.track.kind ?? null;
    if (!receiverKind) {
      console.warn('[sfu] subscribe reconcile failed: new transceiver mid had no receiver kind', {
        publisherClientId,
        realMid,
        newTransceiverMids,
      });
      throw new Error('[sfu] subscribe reconcile failed: missing receiver kind');
    }
    const byKind = midsByReceiverKind.get(receiverKind) ?? [];
    byKind.push(realMid);
    midsByReceiverKind.set(receiverKind, byKind);
  }

  for (const [receiverKind, responseForKind] of responseByReceiverKind) {
    const midsForKind = midsByReceiverKind.get(receiverKind) ?? [];
    if (responseForKind.length !== midsForKind.length) {
      console.warn('[sfu] subscribe reconcile failed: per-kind response track count did not match new transceiver mid count', {
        publisherClientId,
        receiverKind,
        responseTrackCount: responseForKind.length,
        newTransceiverMidCount: midsForKind.length,
        responseTracks,
        newTransceiverMids,
      });
      throw new Error('[sfu] subscribe reconcile failed: per-kind track/mid count mismatch');
    }
  }

  for (const [receiverKind, midsForKind] of midsByReceiverKind) {
    const responseForKind = responseByReceiverKind.get(receiverKind) ?? [];
    if (responseForKind.length !== midsForKind.length) {
      console.warn('[sfu] subscribe reconcile failed: unexpected new transceiver receiver kind', {
        publisherClientId,
        receiverKind,
        responseTrackCount: responseForKind.length,
        newTransceiverMidCount: midsForKind.length,
        responseTracks,
        newTransceiverMids,
      });
      throw new Error('[sfu] subscribe reconcile failed: unexpected receiver kind');
    }
  }

  const result: { realMid: string; publisherClientId: string; trackName: string; kind: string }[] = [];
  for (const responseForKind of responseByReceiverKind.values()) {
    for (let i = 0; i < responseForKind.length; i++) {
      const rt = responseForKind[i];
      const expectedReceiverKind = rt.kind === 'screen' ? 'video' : rt.kind;
      const realMid = midsByReceiverKind.get(expectedReceiverKind)?.[i];
      const transceiver = transceivers.find((candidate) => candidate.mid === realMid);
      const receiverKind = transceiver?.receiver.track.kind ?? null;
      if (!realMid || receiverKind !== expectedReceiverKind) {
        console.warn('[sfu] subscribe reconcile failed: response track kind did not match receiver kind', {
          publisherClientId,
          trackName: rt.trackName,
          expectedKind: rt.kind,
          expectedReceiverKind,
          receiverKind,
          realMid,
        });
        throw new Error('[sfu] subscribe reconcile failed: track kind mismatch');
      }
      result.push({ realMid, publisherClientId, trackName: rt.trackName, kind: rt.kind });
    }
  }

  if (result.length !== responseTracks.length) {
    console.warn('[sfu] subscribe reconcile failed: reconciled result was incomplete', {
      publisherClientId,
      responseTrackCount: responseTracks.length,
      reconciledTrackCount: result.length,
    });
    throw new Error('[sfu] subscribe reconcile failed: incomplete result');
  }
  return result;
}
