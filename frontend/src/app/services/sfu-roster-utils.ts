export interface RemotePublisher {
  clientId: string;
  participantId: string;
  cfSessionId: string;
  tracks: { trackName: string; kind: string }[];
  revision: number;
}

export interface PublishedTrackLike {
  kind: string;
  status: 'live' | 'closed';
}

export interface AdvertisedTrack {
  trackName: string;
  kind: string;
}

export interface SubscribeRetryPlan {
  shouldRetry: boolean;
  nextAttempts: number;
  backoffMs: number | null;
  capped: boolean;
  reason: 'healthy' | 'retry' | 'capped';
}

export interface InitialPublishRetryPlan {
  outcome: 'success' | 'retry' | 'after-cap';
  shouldRetry: boolean;
  shouldAnnounce: boolean;
  nextAttempt: number | null;
  backoffMs: number | null;
  reason: 'published' | 'retryable' | 'capped' | 'permanent';
}

export function planSubscribeRetry(params: {
  currentAttempts: number;
  cap: number;
  hasFirstFrame: boolean;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}): SubscribeRetryPlan {
  const currentAttempts = Math.max(0, Math.floor(params.currentAttempts));
  if (params.hasFirstFrame) {
    return { shouldRetry: false, nextAttempts: currentAttempts, backoffMs: null, capped: false, reason: 'healthy' };
  }

  const nextAttempts = currentAttempts + 1;
  if (nextAttempts > params.cap) {
    return { shouldRetry: false, nextAttempts, backoffMs: null, capped: true, reason: 'capped' };
  }

  const baseBackoffMs = params.baseBackoffMs ?? 250;
  const maxBackoffMs = params.maxBackoffMs ?? 4000;
  const backoffMs = Math.min(baseBackoffMs * Math.pow(2, nextAttempts - 1), maxBackoffMs);
  return { shouldRetry: true, nextAttempts, backoffMs, capped: false, reason: 'retry' };
}

export function planInitialPublishRetry(params: {
  published: boolean;
  failedAttempt: number;
  cap: number;
  retryableFailure: boolean;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}): InitialPublishRetryPlan {
  if (params.published) {
    return { outcome: 'success', shouldRetry: false, shouldAnnounce: true, nextAttempt: null, backoffMs: null, reason: 'published' };
  }

  const failedAttempt = Math.max(1, Math.floor(params.failedAttempt));
  if (!params.retryableFailure) {
    return { outcome: 'after-cap', shouldRetry: false, shouldAnnounce: false, nextAttempt: null, backoffMs: null, reason: 'permanent' };
  }
  if (failedAttempt >= params.cap) {
    return { outcome: 'after-cap', shouldRetry: false, shouldAnnounce: false, nextAttempt: null, backoffMs: null, reason: 'capped' };
  }

  const baseBackoffMs = params.baseBackoffMs ?? 500;
  const maxBackoffMs = params.maxBackoffMs ?? 2000;
  const backoffMs = Math.min(baseBackoffMs * Math.pow(2, failedAttempt - 1), maxBackoffMs);
  return { outcome: 'retry', shouldRetry: true, shouldAnnounce: false, nextAttempt: failedAttempt + 1, backoffMs, reason: 'retryable' };
}

export function shouldRegisterFirstAddedLocalTrack(tracks: PublishedTrackLike[], kind: 'audio' | 'video', hasLiveSenderTrack: boolean): boolean {
  return hasLiveSenderTrack && !tracks.some((track) => track.kind === kind && track.status === 'live');
}

export function selectNewRemoteTracks(
  previousTracks: AdvertisedTrack[],
  nextTracks: AdvertisedTrack[],
  alreadySubscribedTrackNames: Set<string>,
): AdvertisedTrack[] {
  const previousTrackNames = new Set(previousTracks.map((track) => track.trackName));
  return nextTracks.filter((track) => !previousTrackNames.has(track.trackName) && !alreadySubscribedTrackNames.has(track.trackName));
}

export function applyPresenceUpdate(
  publishers: Map<string, RemotePublisher>,
  update: RemotePublisher,
): Map<string, RemotePublisher> {
  const existing = publishers.get(update.clientId);
  if (existing && update.revision <= existing.revision) return publishers;
  const next = new Map(publishers);
  next.set(update.clientId, update);
  return next;
}

export function applyRosterSnapshot(entries: RemotePublisher[]): Map<string, RemotePublisher> {
  return new Map(entries.map((p) => [p.clientId, p]));
}

export function removeFromRoster(
  publishers: Map<string, RemotePublisher>,
  clientId: string,
): Map<string, RemotePublisher> {
  if (!publishers.has(clientId)) return publishers;
  const next = new Map(publishers);
  next.delete(clientId);
  return next;
}
