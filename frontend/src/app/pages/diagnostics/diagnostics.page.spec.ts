import assert from 'node:assert/strict';
import '@angular/compiler';
import { buildCallWideMediaPlayoutRow, buildRemoteAudioPlayoutRows, formatNetworkPathRows, redactedAudioOutputLabel, rttPathHint } from './diagnostics.page.js';
import type { SfuDiagnosticsSnapshot } from '../../services/meeting-sessions.service.js';

assert.equal(rttPathHint(25), 'local edge');
assert.equal(rttPathHint(149), 'regional');
assert.equal(rttPathHint(150), 'long-haul intl');
assert.equal(rttPathHint(null), 'RTT n/a');
assert.equal(redactedAudioOutputLabel('', 'speaker-raw-id'), 'default');
assert.equal(redactedAudioOutputLabel('speaker-raw-id', 'speaker-raw-id'), 'selected');
assert.match(redactedAudioOutputLabel('speaker-raw-id', 'other-speaker'), /^id#[0-9a-f]{6}$/);
assert.equal(redactedAudioOutputLabel(null, 'speaker-raw-id'), 'sink n/a');

{
  const rows = formatNetworkPathRows({
    cfSessionId: 'cf',
    requestedIceTransportPolicy: 'all',
    connectionState: 'connected',
    iceConnectionState: 'connected',
    rttMs: 182,
    localCandidateType: 'srflx',
    remoteCandidateType: 'host',
    selectedCandidatePair: {
      id: 'pair',
      state: 'succeeded',
      selected: true,
      nominated: true,
      local: { id: 'local', candidateType: 'srflx', protocol: 'udp', address: '203.0.113.10', port: 49000 },
      remote: { id: 'remote', candidateType: 'host', protocol: 'udp', address: '198.51.100.20', port: 3478 },
      availableOutgoingBitrate: 1_750_000,
      availableIncomingBitrate: 2_250_000,
      bytesSent: 123_456,
      bytesReceived: 654_321,
    },
    outboundTracks: [
      {
        trackName: 'local-audio',
        kind: 'audio',
        rid: null,
        bytesSent: 12_000,
        packetsSent: 120,
        framesEncoded: null,
        framesSent: null,
        qualityLimitationReason: null,
        remoteRoundTripTimeMs: 191,
        remoteFractionLost: 0.025,
        remoteJitterMs: 6,
      },
    ],
    inboundTracks: [
      {
        publisherClientId: 'remote-a',
        trackName: 'remote-audio',
        kind: 'audio',
        rid: null,
        bytesReceived: 34_000,
        packetsReceived: 340,
        packetsLost: 2,
        framesDecoded: null,
        framesReceived: null,
        jitterBufferDelay: null,
        jitterBufferEmittedCount: null,
        concealedSamples: 12,
        audioLevel: 0.31,
        totalAudioEnergy: 4.25,
        jitter: 0.007,
      },
    ],
    subscribeLatencies: [],
    connectionQuality: {
      route: 'relayed',
      band: 'fair',
      relayUsed: true,
      rttMs: 182,
      packetLossPct: 1.7,
      jitterMs: 28,
      localCandidateType: 'relay',
      remoteCandidateType: 'host',
      sampledAt: Date.now(),
      thresholds: {
        goodRttMs: 150,
        fairRttMs: 300,
        goodPacketLossPct: 2,
        fairPacketLossPct: 5,
        goodJitterMs: 30,
        fairJitterMs: 60,
      },
    },
    outboundAudioSource: { audioLevel: 0.21, totalAudioEnergy: 2.345678 },
  } satisfies SfuDiagnosticsSnapshot);

  assert.equal(rows.find((row) => row.label === 'Egress IP')?.value, '203.0.113.10:49000 · srflx/udp');
  assert.equal(rows.find((row) => row.label === 'CF edge IP')?.value, '198.51.100.20:3478 · host/udp');
  assert.match(rows.find((row) => row.label === 'RTT')?.value ?? '', /182ms · long-haul intl/);
  assert.match(rows.find((row) => row.label === 'Bandwidth')?.value ?? '', /up 1750 kbps · down 2250 kbps/);
  assert.match(rows.find((row) => row.label === 'Audio liveness')?.value ?? '', /mic level 0\.210 .* inbound level 0\.310/);
}

{
  const rows = formatNetworkPathRows(null);
  assert.equal(rows.find((row) => row.label === 'Egress IP')?.value, 'n/a');
  assert.equal(rows.find((row) => row.label === 'CF edge IP')?.value, 'n/a');
  assert.match(rows.find((row) => row.label === 'Loss / jitter')?.value ?? '', /loss n\/a .* send loss n\/a .* jitter n\/a/);
  assert.match(rows.find((row) => row.label === 'Bandwidth')?.value ?? '', /up n\/a · down n\/a/);
  assert.match(rows.find((row) => row.label === 'Audio liveness')?.value ?? '', /mic level n\/a .* inbound level n\/a/);
}

{
  const rows = buildRemoteAudioPlayoutRows(
    {
      selectedAudioOutputId: 'speaker-raw-id',
      effectiveSinkId: 'speaker-raw-id',
      usedFallback: false,
      unlocked: true,
      blockedPeerIds: ['publisher-b'],
      perPublisher: [
        {
          publisherClientId: 'publisher-a',
          trackName: 'track-a',
          trackId: 'browser-track-a',
          paused: false,
          muted: false,
          volume: 0.75,
          sinkId: 'speaker-raw-id',
          blockedReason: null,
          sinkApplyResult: 'selected',
          sinkApplyTimedOut: false,
          srcObjectAttached: true,
          readyState: 'live',
        },
        {
          publisherClientId: 'publisher-b',
          trackName: null,
          trackId: null,
          paused: true,
          muted: true,
          volume: 0,
          sinkId: '',
          blockedReason: 'paused',
          sinkApplyResult: 'default-fallback',
          sinkApplyTimedOut: false,
          srcObjectAttached: false,
          readyState: null,
        },
      ],
    },
    [
      {
        publisherClientId: 'publisher-a',
        trackName: 'track-a',
        kind: 'audio',
        rid: null,
        bytesReceived: 1,
        packetsReceived: 1,
        packetsLost: 0,
        framesDecoded: null,
        framesReceived: null,
        jitterBufferDelay: null,
        jitterBufferEmittedCount: null,
        concealedSamples: null,
        audioLevel: 0.31,
        totalAudioEnergy: 4.25,
      },
      {
        publisherClientId: 'publisher-b',
        trackName: 'publisher-b-audio',
        kind: 'audio',
        rid: null,
        bytesReceived: 1,
        packetsReceived: 1,
        packetsLost: 0,
        framesDecoded: null,
        framesReceived: null,
        jitterBufferDelay: null,
        jitterBufferEmittedCount: null,
        concealedSamples: null,
        audioLevel: 0.11,
        totalAudioEnergy: 1.5,
      },
    ],
    (publisherClientId) => (publisherClientId === 'publisher-a' ? 'Alice' : publisherClientId),
  );

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    publisherClientId: 'publisher-a',
    publisherLabel: 'Alice',
    trackId: 'browser-track-a',
    paused: 'paused no',
    muted: 'muted no',
    volume: 'vol 0.75',
    sink: 'selected',
    blockedReason: 'not blocked',
    sinkApply: 'selected',
    srcObject: 'src attached',
    readyState: 'live',
    audioLevel: 'level 0.310',
    totalAudioEnergy: 'energy 4.250000',
  });
  assert.equal(rows[1]?.sink, 'default');
  assert.equal(rows[1]?.paused, 'paused yes');
  assert.equal(rows[1]?.trackId, 'track n/a');
  assert.equal(rows[1]?.audioLevel, 'level 0.110', 'publisher row uses publisher inbound level, not call-wide media-playout');
  assert.equal(rows[1]?.totalAudioEnergy, 'energy 1.500000', 'publisher row uses publisher inbound energy, not call-wide media-playout');
  assert.deepEqual(buildRemoteAudioPlayoutRows(undefined, []), []);
  assert.deepEqual(buildCallWideMediaPlayoutRow({ audioLevel: 0.42, totalAudioEnergy: 7.5, totalSamplesDuration: 11.25 }), {
    audioLevel: 'level 0.420',
    totalAudioEnergy: 'energy 7.500000',
    totalSamplesDuration: 'samples 11.250s',
  });
  assert.equal(buildCallWideMediaPlayoutRow(undefined), null);
}

{
  const rows = buildRemoteAudioPlayoutRows({
    selectedAudioOutputId: 'speaker-raw-id',
    effectiveSinkId: '',
    usedFallback: true,
    unlocked: true,
    blockedPeerIds: [],
    perPublisher: [
      {
        publisherClientId: 'publisher-a',
        trackName: 'track-a',
        trackId: 'browser-track-a',
        paused: false,
        muted: false,
        volume: 1,
        sinkId: '',
        blockedReason: null,
        sinkApplyResult: 'default-fallback',
        sinkApplyTimedOut: false,
        srcObjectAttached: true,
        readyState: 'live',
      },
    ],
  });

  assert.equal(rows[0]?.sink, 'default fallback', 'diagnostics distinguish selected-speaker fallback from selected success');
}

console.log('diagnostics page network path helpers: all assertions passed');
