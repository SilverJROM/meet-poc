import assert from 'node:assert/strict';
import type { DiagnosticsPeerSample } from './meeting-sessions.service.js';
import { isInboundVideoExpectedForPeer } from './webrtc-diagnostics.js';

const defaultContext = {
  manualAudioOnly: false,
  autoPaused: false,
  mobileAutoPaused: false,
  remotePaused: false,
};

assert.equal(
  isInboundVideoExpectedForPeer({ isLocal: false, camEnabled: false, screenOn: true }, defaultContext),
  true,
  'screen sharing peer should be expected to send inbound video even when camera is off',
);

assert.equal(
  isInboundVideoExpectedForPeer({ isLocal: false, camEnabled: false, screenOn: false }, defaultContext),
  false,
  'audio-only peer should not be expected to send inbound video',
);

const diagnosticStatsSample = {
  inboundAudio: {
    packetsReceived: 10,
    packetsLost: 0,
    bytesReceived: 6400,
    audioLevel: 0.4,
    jitterBufferDelay: 0.12,
    jitterBufferTargetDelay: 0.16,
    jitterBufferEmittedCount: 8,
    concealedSamples: 20,
    concealmentEvents: 1,
    remoteRoundTripTime: 0.04,
    remoteFractionLost: 0,
    packetsReceivedDelta: 5,
    packetsActivelyArriving: true,
    trackReadyState: 'live',
    trackMuted: false,
  },
  outboundVideoStats: {
    bytesSent: 4096,
    packetsSent: 32,
    framesEncoded: 12,
    framesSent: 12,
    framesSentDelta: 3,
    keyFramesEncoded: 1,
    frameWidth: 1280,
    frameHeight: 720,
    framesPerSecond: 30,
    targetBitrate: 700000,
    qualityLimitationReason: 'none',
    qualityLimitationDurations: { none: 1 },
    nackCount: 0,
    pliCount: 0,
    firCount: 0,
    activelySending: true,
    senderEncoding: {
      active: true,
      maxBitrate: 700000,
      scaleResolutionDownBy: 1,
      maxFramerate: 30,
      priority: 'high',
      networkPriority: 'high',
    },
    senderTrackId: 'video-track-1',
    senderTrackLabel: 'camera',
    senderTrackKind: 'video',
    senderTrackSource: 'sender',
  },
} satisfies Pick<DiagnosticsPeerSample, 'inboundAudio' | 'outboundVideoStats'>;

assert.equal(diagnosticStatsSample.outboundVideoStats.activelySending, true);
assert.equal(diagnosticStatsSample.inboundAudio.jitterBufferDelay, 0.12);

console.log('PASS webrtc-diagnostics inbound-video expectation');
