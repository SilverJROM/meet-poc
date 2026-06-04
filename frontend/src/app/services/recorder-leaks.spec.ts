import assert from 'node:assert/strict';
import { signal } from '@angular/core';
import { RecorderService } from './recorder.service.js';

type FakeSource = {
  connectCount: number;
  disconnectCount: number;
  connect: (dest: unknown) => void;
  disconnect: () => void;
};

function createRecorder(): RecorderService {
  const recorder = Object.create(RecorderService.prototype) as RecorderService;
  (recorder as unknown as { sourceFor: Map<string, MediaStreamAudioSourceNode> }).sourceFor = new Map();
  (recorder as unknown as { sourceCount: ReturnType<typeof signal<number>> }).sourceCount = signal(0);
  return recorder;
}

function fakeAudioStream(label: string): MediaStream {
  return {
    id: label,
    getAudioTracks: () => [{ kind: 'audio', readyState: 'live' }],
    getTracks: () => [{ kind: 'audio', readyState: 'live' }],
  } as unknown as MediaStream;
}

function installFakeGraph(service: RecorderService): FakeSource[] {
  const created: FakeSource[] = [];
  const ctx = {
    createMediaStreamSource: () => {
      const source: FakeSource = {
        connectCount: 0,
        disconnectCount: 0,
        connect: () => {
          source.connectCount += 1;
        },
        disconnect: () => {
          source.disconnectCount += 1;
        },
      };
      created.push(source);
      return source;
    },
  };
  (service as unknown as { ctx: unknown; dest: unknown }).ctx = ctx;
  (service as unknown as { dest: unknown }).dest = {};
  return created;
}

// LEAK2 — re-adding the same recorder source disconnects the old node and keeps one live source.
{
  const recorder = createRecorder();
  const sources = installFakeGraph(recorder);
  const addStream = (recorder as unknown as { addStream: (clientId: string, stream: MediaStream) => void }).addStream.bind(recorder);

  addStream('peer-1', fakeAudioStream('first'));
  assert.equal(recorder.sourceCount(), 1, 'first peer stream registers one source');
  assert.equal(sources.length, 1, 'first peer stream creates one source node');
  assert.equal(sources[0].connectCount, 1, 'first source is connected to the recorder mix');

  addStream('peer-1', fakeAudioStream('replacement'));
  assert.equal(recorder.sourceCount(), 1, 'replacement keeps sourceCount stable at one for the peer');
  assert.equal(sources.length, 2, 'replacement creates a new source node');
  assert.equal(sources[0].disconnectCount, 1, 'old source is disconnected before replacement is retained');
  assert.equal(sources[1].connectCount, 1, 'replacement source is connected to the recorder mix');
}

console.log('recorder-leaks: all assertions passed');
