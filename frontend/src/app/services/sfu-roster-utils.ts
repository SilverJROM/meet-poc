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
