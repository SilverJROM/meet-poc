import assert from 'node:assert/strict';
import '@angular/compiler';
import { formatNetworkPathRows, rttPathHint } from './diagnostics.page.js';
import type { SfuDiagnosticsSnapshot } from '../../services/meeting-sessions.service.js';

assert.equal(rttPathHint(25), 'local edge');
assert.equal(rttPathHint(149), 'regional');
assert.equal(rttPathHint(150), 'long-haul intl');
assert.equal(rttPathHint(null), 'RTT n/a');

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

console.log('diagnostics page network path helpers: all assertions passed');
