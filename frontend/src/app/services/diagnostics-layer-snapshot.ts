import type { LocalPublishState, SfuRecoveryDiagnosticsEvent } from './sfu-client.service.js';
import type { SubscribeFailureEvidence } from './sfu-subscribe-failure-evidence.js';
import type {
  DiagnosticsGumError,
  DiagnosticsLayerSnapshot,
  DiagnosticsPeerSample,
  RemoteAudioPlayoutDiagnostics,
  SfuInboundTrackStats,
} from './meeting-sessions.service.js';

export type BuildLayerDiagnosticsInput = {
  lastGumError: DiagnosticsGumError | null | undefined;
  localPublishState: LocalPublishState | null;
  publishRecoveryFailed: boolean;
  lastSubscribeFailureEvidence: SubscribeFailureEvidence | null;
  lastRecoveryEvent: SfuRecoveryDiagnosticsEvent | null;
  sfuRejoinThrottled: boolean;
  remoteAudioPlayout: RemoteAudioPlayoutDiagnostics | null | undefined;
  inboundTracks: SfuInboundTrackStats[];
  peers: DiagnosticsPeerSample[];
};

export function buildLayerDiagnostics(input: BuildLayerDiagnosticsInput): DiagnosticsLayerSnapshot {
  return {
    device: { lastGumError: input.lastGumError ?? null },
    publish: {
      cfSessionId: input.localPublishState?.cfSessionId ?? null,
      status: input.localPublishState?.status ?? null,
      error: input.localPublishState?.error ?? null,
      publishRecoveryFailed: input.publishRecoveryFailed,
    },
    subscribe: input.lastSubscribeFailureEvidence,
    recovery: {
      lastRecoveryEvent: input.lastRecoveryEvent,
      sfuRejoinThrottled: input.sfuRejoinThrottled,
    },
    playout: input.remoteAudioPlayout ?? null,
    remoteInbound: input.inboundTracks
      .filter((track) => track.kind === 'audio')
      .map((track) => ({
        publisherClientId: track.publisherClientId,
        trackName: track.trackName,
        bytesReceived: track.bytesReceived,
        packetsReceived: track.packetsReceived,
        packetsLost: track.packetsLost,
        audioLevel: track.audioLevel ?? null,
        totalAudioEnergy: track.totalAudioEnergy ?? null,
        concealedSamples: track.concealedSamples,
      })),
    advertisedNotSubscribed: input.peers
      .filter((peer) => !peer.isLocal && peer.advertisedSubscribed === false)
      .map((peer) => ({
        publisherClientId: peer.id,
        name: peer.name,
        advertisedAudioTrackNames: peer.advertisedAudioTrackNames ?? [],
        actionHint:
          'Publisher advertised audio but SFU subscribe is not bound — inspect subscribe layer for /api/sfu/tracks HTTP errors and recovery rung.',
      })),
  };
}