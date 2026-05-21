import assert from 'node:assert/strict';
import { decideAutoReceiverVideoPolicy } from './webrtc-video-policy.js';

const base = {
  connectionState: 'connected' as RTCPeerConnectionState,
  iceConnectionState: 'connected' as RTCIceConnectionState,
  inboundVideoExpected: true,
  inboundPacketsReceivedTotal: 48,
  quality: 'poor' as const,
  audioOnlyFloor: true,
  poorSamples: 3,
  restoreSamples: 0,
  degradeThreshold: 3,
  restoreThreshold: 5,
  currentlyPaused: false,
  currentlyDegraded: false,
};

assert.equal(
  decideAutoReceiverVideoPolicy(base),
  'degrade',
  'marginal but connected audio-only floor should degrade active video instead of pausing',
);

assert.equal(
  decideAutoReceiverVideoPolicy({
    ...base,
    inboundPacketsReceivedTotal: 0,
  }),
  'pause',
  'failed/disconnected or zero-packet expected video should fully pause',
);

assert.equal(
  decideAutoReceiverVideoPolicy({
    ...base,
    quality: 'weak',
    audioOnlyFloor: false,
    poorSamples: 0,
    restoreSamples: 5,
    currentlyDegraded: true,
  }),
  'restore',
  'sustained non-poor weak quality should restore a degraded peer',
);

console.log('PASS webrtc-video-policy DR-56 decisions');
