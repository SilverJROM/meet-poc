export interface RemotePublisher {
  clientId: string;
  participantId: string;
  cfSessionId: string;
  tracks: { trackName: string; kind: string }[];
  revision: number;
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
