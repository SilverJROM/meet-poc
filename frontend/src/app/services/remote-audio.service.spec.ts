import assert from 'node:assert/strict';
import {
  AUDIO_OUTPUT_DEVICE_STORAGE_KEY,
  applyMediaElementSinkWithDefaultFallback,
  clearStoredAudioOutputDeviceId,
} from './remote-audio.service.js';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

type FakeSinkElement = HTMLMediaElement & {
  calls: string[];
  setSinkId: (sinkId: string) => Promise<void>;
};

const memory = new MemoryStorage();
const g = globalThis as unknown as { localStorage: MemoryStorage; window: { localStorage: MemoryStorage } };
g.localStorage = memory;
g.window = { localStorage: memory };

function fakeSinkElement(rejectIds: Set<string>): FakeSinkElement {
  const element = {
    calls: [] as string[],
    async setSinkId(sinkId: string): Promise<void> {
      this.calls.push(sinkId);
      if (rejectIds.has(sinkId)) throw new Error(`bad sink ${sinkId}`);
    },
  };
  return element as FakeSinkElement;
}

// B13-U1: bad selected sink retries only that element on default and clears storage.
{
  memory.clear();
  memory.setItem(AUDIO_OUTPUT_DEVICE_STORAGE_KEY, 'stale-speaker');
  const element = fakeSinkElement(new Set(['stale-speaker']));

  const applied = await applyMediaElementSinkWithDefaultFallback(element, 'stale-speaker', {
    onSelectedSinkFailure: clearStoredAudioOutputDeviceId,
    label: 'unit-bad-sink',
  });

  assert.strictEqual(applied, false, 'bad selected sink reports fallback');
  assert.deepStrictEqual(element.calls, ['stale-speaker', ''], 'bad selected sink retries default output for the same element');
  assert.strictEqual(memory.getItem(AUDIO_OUTPUT_DEVICE_STORAGE_KEY), null, 'bad selected sink clears stored output id');
}

// B13-U2: valid selected sink applies once and remains persisted.
{
  memory.clear();
  memory.setItem(AUDIO_OUTPUT_DEVICE_STORAGE_KEY, 'valid-speaker');
  const element = fakeSinkElement(new Set());

  const applied = await applyMediaElementSinkWithDefaultFallback(element, 'valid-speaker', {
    onSelectedSinkFailure: clearStoredAudioOutputDeviceId,
    label: 'unit-valid-sink',
  });

  assert.strictEqual(applied, true, 'valid selected sink reports success');
  assert.deepStrictEqual(element.calls, ['valid-speaker'], 'valid selected sink does not fall back to default');
  assert.strictEqual(memory.getItem(AUDIO_OUTPUT_DEVICE_STORAGE_KEY), 'valid-speaker', 'valid selected sink remains stored');
}

console.log('remote-audio-service: all assertions passed');
