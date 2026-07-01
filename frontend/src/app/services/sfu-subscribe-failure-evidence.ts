import type { SubscribedTrackEntry } from './sfu-client.service.js';
import type { RemotePublisher } from './sfu-roster-utils.js';

export type SubscribeFailureOperation = 'subscribe' | 'publish';

export type SubscribeFailureEvidence = {
  recordedAtMs: number;
  operation: SubscribeFailureOperation;
  endpoint: string;
  httpStatus: number | null;
  errorCode: string | null;
  errorDescription: string | null;
  localCfSessionId: string | null;
  remoteCfSessionId: string | null;
  publisherClientId: string | null;
  publisherParticipantId: string | null;
  trackNames: string[];
  pcSignalingState: string | null;
  message: string;
};

type HttpErrorLike = {
  status?: unknown;
  error?: unknown;
  message?: unknown;
};

function readString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function extractSubscribeFailureEvidence(
  err: unknown,
  context: {
    operation: SubscribeFailureOperation;
    endpoint: string;
    publisher?: RemotePublisher | null;
    trackNames?: string[];
    localCfSessionId?: string | null;
    remoteCfSessionId?: string | null;
    pcSignalingState?: string | null;
  },
): SubscribeFailureEvidence {
  const http = err as HttpErrorLike;
  const status = readNumber(http.status);
  const errorBody = http.error && typeof http.error === 'object' ? (http.error as Record<string, unknown>) : null;
  const errorCode = readString(errorBody?.['errorCode']) ?? readString(errorBody?.['code']);
  const errorDescription =
    readString(errorBody?.['errorDescription']) ??
    readString(errorBody?.['error']) ??
    readString(http.message) ??
    String(err ?? 'unknown subscribe failure');

  return {
    recordedAtMs: Date.now(),
    operation: context.operation,
    endpoint: context.endpoint,
    httpStatus: status,
    errorCode,
    errorDescription,
    localCfSessionId: context.localCfSessionId ?? null,
    remoteCfSessionId: context.remoteCfSessionId ?? context.publisher?.cfSessionId ?? null,
    publisherClientId: context.publisher?.clientId ?? null,
    publisherParticipantId: context.publisher?.participantId ?? null,
    trackNames: context.trackNames ?? context.publisher?.tracks.map((track) => track.trackName) ?? [],
    pcSignalingState: context.pcSignalingState ?? null,
    message: errorDescription,
  };
}

export function remotePublisherDiagnosticsQuality(
  publisher: RemotePublisher,
  subscribedEntries: Iterable<SubscribedTrackEntry>,
): 'subscribed' | 'advertised-not-subscribed' {
  const advertisedAudioTrackNames = publisher.tracks.filter((track) => track.kind === 'audio').map((track) => track.trackName);
  if (!advertisedAudioTrackNames.length) return 'advertised-not-subscribed';
  const entries = [...subscribedEntries];
  const advertisedSubscribed = advertisedAudioTrackNames.every((trackName) =>
    entries.some((entry) => entry.publisherClientId === publisher.clientId && entry.trackName === trackName),
  );
  return advertisedSubscribed ? 'subscribed' : 'advertised-not-subscribed';
}

export function isLastGumErrorCandidate(err: unknown): boolean {
  const value = err as { code?: unknown; name?: unknown };
  const code = typeof value?.code === 'string' ? value.code : null;
  if (code && ['denied', 'no-devices', 'in-use'].includes(code)) return true;
  const name = typeof value?.name === 'string' ? value.name : '';
  return /NotAllowed|NotFound|NotReadable|Overconstrained|Security|Abort/i.test(name);
}