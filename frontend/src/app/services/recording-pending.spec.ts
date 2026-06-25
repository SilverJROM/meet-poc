import assert from 'node:assert/strict';
import {
  clearPendingRecordingMarker,
  pendingRecordingSessionIds,
  reconcilePendingRecordings,
} from './recording-pending.js';
import type { PaginatedRecordings, RecordingsService } from './recordings.service.js';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

function emptyPage(): PaginatedRecordings {
  return { recordings: [], page: 1, pageSize: 1, total: 0 };
}

function serviceWithSessions(confirmedSessionIds: Set<string>): Pick<RecordingsService, 'list'> {
  return {
    async list({ sessionId }: { page: number; pageSize: number; sessionId?: string | null }): Promise<PaginatedRecordings> {
      if (sessionId && confirmedSessionIds.has(sessionId)) {
        return {
          recordings: [
            {
              filename: `${sessionId}.webm`,
              sizeBytes: 10,
              sessionId,
              roomId: 'abc123abc123',
              roomTitle: 'Team Sync',
              uploadedAtIso: new Date(0).toISOString(),
              hasMetadata: false,
              speakerCount: null,
              durationMs: null,
              hasTranscript: false,
              transcribeStatus: null,
            },
          ],
          page: 1,
          pageSize: 1,
          total: 1,
        };
      }
      return emptyPage();
    },
  };
}

{
  const storage = new MemoryStorage();
  storage.setItem('recording-pending-session-a', '1');
  storage.setItem('other-key', '1');

  assert.deepEqual(pendingRecordingSessionIds(storage), ['session-a'], 'only recording-pending markers are returned');
}

{
  const storage = new MemoryStorage();
  storage.setItem('recording-pending-session-a', '1');

  clearPendingRecordingMarker('session-a', storage);

  assert.deepEqual(pendingRecordingSessionIds(storage), [], 'confirmed marker can be cleared by session id');
}

{
  const storage = new MemoryStorage();
  storage.setItem('recording-pending-session-a', '1');
  storage.setItem('recording-pending-session-b', '1');

  const result = await reconcilePendingRecordings(serviceWithSessions(new Set(['session-a'])), storage);

  assert.deepEqual(result.confirmedSessionIds, ['session-a'], 'confirmed upload is reported');
  assert.deepEqual(result.pendingSessionIds, ['session-b'], 'missing upload stays pending');
  assert.strictEqual(storage.getItem('recording-pending-session-a'), null, 'confirmed marker is removed');
  assert.strictEqual(storage.getItem('recording-pending-session-b'), '1', 'unconfirmed marker remains for surfacing/retry');
}

{
  const storage = new MemoryStorage();
  storage.setItem('recording-pending-session-a', '1');
  const failingService: Pick<RecordingsService, 'list'> = {
    async list(): Promise<PaginatedRecordings> {
      throw new Error('network down');
    },
  };

  const result = await reconcilePendingRecordings(failingService, storage);

  assert.deepEqual(result.confirmedSessionIds, [], 'failed confirmation does not claim success');
  assert.deepEqual(result.pendingSessionIds, ['session-a'], 'failed confirmation remains pending');
  assert.strictEqual(storage.getItem('recording-pending-session-a'), '1', 'failed confirmation keeps marker');
}

console.log('recording-pending: all assertions passed');
