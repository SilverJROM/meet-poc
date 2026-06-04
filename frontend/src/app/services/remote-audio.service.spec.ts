import assert from 'node:assert/strict';
import {
  AUDIO_OUTPUT_DEVICE_STORAGE_KEY,
  applyMediaElementSinkWithDefaultFallback,
  clearStoredAudioOutputDeviceId,
  LatestSinkIdApplier,
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

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for sink test predicate');
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
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

// ERR9: concurrent requests for the same element do not overlap and coalesce to the latest sink.
{
  memory.clear();
  const firstCall = deferred();
  const calls: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let currentSinkId = '';
  const element = {
    async setSinkId(sinkId: string): Promise<void> {
      calls.push(sinkId);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        if (calls.length === 1) await firstCall.promise;
        else await new Promise((resolve) => setTimeout(resolve, 0));
        currentSinkId = sinkId;
      } finally {
        inFlight -= 1;
      }
    },
  } as HTMLMediaElement & { setSinkId: (sinkId: string) => Promise<void> };
  const applier = new LatestSinkIdApplier();

  const first = applier.apply(element, 'speaker-a', { label: 'unit-err9' });
  await waitFor(() => calls.length === 1);
  const second = applier.apply(element, 'speaker-b', { label: 'unit-err9' });
  const third = applier.apply(element, 'speaker-c', { label: 'unit-err9' });
  firstCall.resolve();
  await Promise.all([first, second, third]);

  assert.deepStrictEqual(calls, ['speaker-a', 'speaker-c'], 'latest sink coalescer skips stale middle requests');
  assert.strictEqual(maxInFlight, 1, 'latest sink coalescer serializes setSinkId per element');
  assert.strictEqual(currentSinkId, 'speaker-c', 'latest sink coalescer converges to final chosen output');
}

console.log('remote-audio-service: all assertions passed');
