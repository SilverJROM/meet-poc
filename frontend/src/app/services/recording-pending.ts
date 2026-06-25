import type { RecordingsService } from './recordings.service';

const PENDING_RECORDING_PREFIX = 'recording-pending-';

export type PendingRecordingReconciliation = {
  confirmedSessionIds: string[];
  pendingSessionIds: string[];
};

export function pendingRecordingSessionIds(storage: Storage = window.localStorage): string[] {
  const sessionIds: string[] = [];
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key?.startsWith(PENDING_RECORDING_PREFIX)) {
        sessionIds.push(key.slice(PENDING_RECORDING_PREFIX.length));
      }
    }
  } catch {
    return [];
  }
  return sessionIds.filter(Boolean);
}

export function clearPendingRecordingMarker(sessionId: string, storage: Storage = window.localStorage): void {
  try {
    storage.removeItem(`${PENDING_RECORDING_PREFIX}${sessionId}`);
  } catch {
    // localStorage can be unavailable in private or locked-down browsing modes.
  }
}

export async function reconcilePendingRecordings(
  recordingsService: Pick<RecordingsService, 'list'>,
  storage: Storage = window.localStorage,
): Promise<PendingRecordingReconciliation> {
  const confirmedSessionIds: string[] = [];
  const pendingSessionIds: string[] = [];

  for (const sessionId of pendingRecordingSessionIds(storage)) {
    try {
      const result = await recordingsService.list({ page: 1, pageSize: 1, sessionId });
      const confirmed = result.total > 0 || result.recordings.some((recording) => recording.sessionId === sessionId);
      if (confirmed) {
        clearPendingRecordingMarker(sessionId, storage);
        confirmedSessionIds.push(sessionId);
      } else {
        pendingSessionIds.push(sessionId);
      }
    } catch {
      pendingSessionIds.push(sessionId);
    }
  }

  return { confirmedSessionIds, pendingSessionIds };
}
