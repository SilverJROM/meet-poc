import assert from 'node:assert/strict';
import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { diagnosticsGumError } from './diagnostics-gum-error.js';
import { buildLayerDiagnostics } from './diagnostics-layer-snapshot.js';
import { extractSubscribeFailureEvidence, isLastGumErrorCandidate } from './sfu-subscribe-failure-evidence.js';
import { buildLayerDiagnosticsRows, buildSubscriptionGapRows } from '../pages/diagnostics/diagnostics.page.js';

function make406Error(): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 406,
    statusText: 'Not Acceptable',
    url: '/api/sfu/tracks',
    error: {
      errorDescription: 'session_not_found',
      errorCode: 'session_not_found',
      status: 406,
      endpoint: 'tracks',
      faultInjected: true,
    },
  });
}

function makeDeniedMediaError(): { code: string; name: string; message: string } {
  return { code: 'denied', name: 'NotAllowedError', message: 'Permission denied' };
}

// R5a — reproduce-first: a /api/sfu/tracks 406 must NOT be classified as lastGumError.
{
  const err = make406Error();
  assert.equal(isLastGumErrorCandidate(err), false, 'R5a: 406 is not a GUM candidate');
  assert.equal(diagnosticsGumError(err), null, 'R5a: diagnosticsGumError(406) returns null — never lastGumError');
}

// R5a — real device/GUM errors still populate lastGumError.
{
  const err = makeDeniedMediaError();
  assert.equal(isLastGumErrorCandidate(err), true, 'R5a: denied mic error is a GUM candidate');
  assert.deepEqual(diagnosticsGumError(err), {
    name: 'denied',
    message: 'Permission denied',
  }, 'R5a: denied mic error still maps to lastGumError');
}

// R5a/R5b outcome — subscribe 406 lands in subscribe layer, NOT device.lastGumError.
{
  const err = make406Error();
  const subscribeEvidence = extractSubscribeFailureEvidence(err, {
    operation: 'subscribe',
    endpoint: 'POST /api/sfu/tracks',
    localCfSessionId: 'local-cf',
    remoteCfSessionId: 'bob-cf',
    pcSignalingState: 'have-local-offer',
    trackNames: ['bob-audio'],
    publisher: {
      clientId: 'bob',
      participantId: 'p-bob',
      cfSessionId: 'bob-cf',
      revision: 1,
      tracks: [{ trackName: 'bob-audio', kind: 'audio' }],
    },
  });

  const layers = buildLayerDiagnostics({
    lastGumError: diagnosticsGumError(err),
    localPublishState: { cfSessionId: 'local-cf', status: 'published', tracks: [] },
    publishRecoveryFailed: false,
    lastSubscribeFailureEvidence: subscribeEvidence,
    lastRecoveryEvent: { rung: 'subscribe-retry', publisherClientId: 'bob', epoch: 2, attempt: 1, atMs: Date.now() },
    sfuRejoinThrottled: false,
    remoteAudioPlayout: null,
    inboundTracks: [],
    peers: [
      {
        id: 'bob',
        name: 'Bob',
        advertisedAudioTrackNames: ['bob-audio'],
        advertisedSubscribed: false,
        isLocal: false,
        isHost: false,
        connectionState: 'advertised',
        iceConnectionState: 'n/a',
        iceGatheringState: 'n/a',
        signalingState: 'n/a',
        selectedCandidateType: null,
        candidatePair: null,
        candidatePairCount: 0,
        nominatedPairChanges: 0,
        iceRelayGathered: { local: false, remote: false },
        iceRestart: {
          fired: false,
          attempts: 0,
          lastAttemptAt: null,
          lastOutcome: null,
          lastTimeToRecoverMs: null,
          terminalFailed: false,
          autoRecoveryOutcome: null,
        },
        negotiation: {
          negotiationNeededCount: 0,
          offerSentCount: 0,
          answerSentCount: 0,
          offerReceivedCount: 0,
          answerReceivedCount: 0,
          lastNegotiationNeededOfferSent: null,
          makingOffer: false,
          ignoreOffer: false,
          glareIgnoredCount: 0,
          rollbackCount: 0,
        },
        transceivers: [],
        transitionTimeline: [],
        relayUsed: false,
        quality: 'advertised-not-subscribed',
        packetLossPct: null,
        jitterMs: null,
        rttMs: null,
        availableOutgoingBitrateKbps: null,
        audioOnlyReason: null,
        micEnabled: true,
        camEnabled: false,
        screenOn: false,
        outboundAudio: { id: '', kind: 'audio', deviceId: null, label: null, enabled: false, muted: false, readyState: null, source: 'none' },
        inboundAudio: {
          packetsReceived: 0,
          packetsLost: 0,
          bytesReceived: 0,
          audioLevel: null,
          packetsReceivedDelta: null,
          packetsActivelyArriving: false,
          trackReadyState: null,
          trackMuted: null,
        },
        outboundVideo: { id: '', kind: 'video', deviceId: null, label: null, enabled: false, muted: false, readyState: null, source: 'none' },
        updatedAt: Date.now(),
      },
    ],
  });

  assert.equal(layers.device.lastGumError, null, 'R5a outcome: device.lastGumError stays null for subscribe 406');
  assert.equal(layers.subscribe?.httpStatus, 406, 'R5a outcome: subscribe layer records HTTP 406');
  assert.equal(layers.subscribe?.endpoint, 'POST /api/sfu/tracks', 'R5a outcome: subscribe layer records /api/sfu/tracks endpoint');
  assert.equal(layers.subscribe?.errorCode, 'session_not_found', 'R5a outcome: subscribe layer records errorCode');
  assert.equal(layers.recovery.lastRecoveryEvent?.rung, 'subscribe-retry', 'R5b: recovery layer wired from existing signal');
  assert.equal(layers.publish.status, 'published', 'R5b: publish layer wired from existing signal');
  assert.equal(layers.advertisedNotSubscribed.length, 1, 'R5c: advertised-not-subscribed gap surfaced in layer payload');
  assert.equal(layers.advertisedNotSubscribed[0]?.publisherClientId, 'bob', 'R5c: gap names the publisher');

  const layerRows = buildLayerDiagnosticsRows(layers);
  const subscribeRow = layerRows.find((row) => row.layer === 'Subscribe');
  assert.ok(subscribeRow, 'R5c: diagnostics page gets a Subscribe row');
  assert.match(subscribeRow?.value ?? '', /HTTP 406/, 'R5c: Subscribe row shows HTTP 406');
  assert.equal(subscribeRow?.class, 'layer-bad', 'R5c: Subscribe row is visibly bad');

  const gapRows = buildSubscriptionGapRows(layers);
  assert.equal(gapRows.length, 1, 'R5c: subscription gap row rendered');
  assert.equal(gapRows[0]?.name, 'Bob', 'R5c: gap row shows publisher name');
  assert.equal(gapRows[0]?.class, 'subscription-gap-bad', 'R5c: gap row uses bad styling class');
}

console.log('diagnostics-layer-honesty: all assertions passed');