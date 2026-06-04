import assert from 'node:assert/strict';
import { signal } from '@angular/core';
import { RecorderService } from './recorder.service.js';
import { syncRecorderPeerStreams } from '../pages/room/room-recording.js';
import type { PeerState } from './peer-state.js';

type FakeSource = {
  connectCount: number;
  disconnectCount: number;
  connect: (dest: unknown) => void;
  disconnect: () => void;
};

function createRecorder(): RecorderService {
  const recorder = Object.create(RecorderService.prototype) as RecorderService;
  (recorder as unknown as { sourceFor: Map<string, MediaStreamAudioSourceNode> }).sourceFor = new Map();
  (recorder as unknown as { isRecording: ReturnType<typeof signal<boolean>> }).isRecording = signal(true);
  (recorder as unknown as { isUploading: ReturnType<typeof signal<boolean>> }).isUploading = signal(false);
  (recorder as unknown as { lastUpload: ReturnType<typeof signal<unknown>> }).lastUpload = signal(null);
  (recorder as unknown as { lastMetadataUpload: ReturnType<typeof signal<unknown>> }).lastMetadataUpload = signal(null);
  (recorder as unknown as { metadataWarning: ReturnType<typeof signal<string | null>> }).metadataWarning = signal(null);
  (recorder as unknown as { lastRecordingMime: ReturnType<typeof signal<string | null>> }).lastRecordingMime = signal(null);
  (recorder as unknown as { lastRecordingExtension: ReturnType<typeof signal<string>> }).lastRecordingExtension = signal('webm');
  (recorder as unknown as { lastRecorderTimeslice: ReturnType<typeof signal<number | null>> }).lastRecorderTimeslice = signal(null);
  (recorder as unknown as { sourceCount: ReturnType<typeof signal<number>> }).sourceCount = signal(0);
  (recorder as unknown as { chunks: Blob[] }).chunks = [];
  (recorder as unknown as { participants: Map<string, unknown> }).participants = new Map();
  (recorder as unknown as { segments: unknown[] }).segments = [];
  (recorder as unknown as { openSegment: unknown | null }).openSegment = null;
  (recorder as unknown as { platform: { isIOS: () => boolean } }).platform = { isIOS: () => false };
  return recorder;
}

function fakeAudioStream(label: string): MediaStream {
  return {
    id: label,
    getAudioTracks: () => [{ kind: 'audio', readyState: 'live' }],
    getTracks: () => [{ kind: 'audio', readyState: 'live' }],
  } as unknown as MediaStream;
}

function fakePeer(id: string, stream: MediaStream | null, isLocal = false): PeerState {
  return {
    id,
    participantId: id,
    stream,
    pc: null,
    name: id,
    connectionState: stream ? 'connected' : 'connecting',
    iceConnectionState: 'connected',
    iceGatheringState: 'complete',
    signalingState: 'stable',
    selectedCandidateType: null,
    quality: 'good',
    packetLossPct: null,
    jitterMs: null,
    rttMs: null,
    availableOutgoingBitrateKbps: null,
    audioOnlyReason: null,
    updatedAt: Date.now(),
    isLocal,
    isHost: isLocal,
    micEnabled: true,
    camEnabled: false,
    screenOn: false,
    reconnecting: false,
    reconnectingSince: null,
    isMobile: false,
  };
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

// REC1 — suspended mobile AudioContext is resumed and awaited before MediaRecorder construction/start.
{
  const events: string[] = [];
  let resolveResume!: () => void;
  class FakeAudioContext {
    state: AudioContextState = 'suspended';
    createMediaStreamDestination(): MediaStreamAudioDestinationNode {
      events.push('destination-created');
      return { stream: fakeAudioStream('mix') } as unknown as MediaStreamAudioDestinationNode;
    }
    createMediaStreamSource(): MediaStreamAudioSourceNode {
      events.push('source-created');
      return {
        connect: () => events.push('source-connected'),
        disconnect: () => events.push('source-disconnected'),
      } as unknown as MediaStreamAudioSourceNode;
    }
    resume(): Promise<void> {
      events.push('resume-called');
      return new Promise((resolve) => {
        resolveResume = () => {
          events.push('resume-resolved');
          this.state = 'running';
          resolve();
        };
      });
    }
  }
  class FakeMediaRecorder {
    static isTypeSupported(): boolean {
      return false;
    }
    ondataavailable: ((event: { data: { size: number } }) => void) | null = null;
    constructor() {
      events.push('recorder-constructed');
    }
    start(): void {
      events.push('recorder-started');
    }
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { AudioContext: FakeAudioContext },
  });
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: FakeMediaRecorder,
  });
  const recorder = createRecorder();
  recorder.isRecording.set(false);

  const started = recorder.start(fakeAudioStream('local'), new Map());
  await Promise.resolve();
  assert.deepEqual(
    events.filter((event) => event.startsWith('recorder-')),
    [],
    'recorder is not constructed or started while suspended context resume is pending',
  );

  resolveResume();
  await started;
  assert.deepEqual(
    events.slice(events.indexOf('resume-called'), events.indexOf('recorder-started') + 1),
    ['resume-called', 'resume-resolved', 'recorder-constructed', 'recorder-started'],
    'suspended context resume is awaited before MediaRecorder construction/start',
  );
  assert.equal(recorder.isRecording(), true, 'recorder is marked recording after resume and start complete');
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

// REC2 — room sync evicts dropped recorder-tracked peers from a snapshot and keeps sourceCount accurate.
{
  const recorder = createRecorder();
  const sources = installFakeGraph(recorder);
  const addStream = (recorder as unknown as { addStream: (clientId: string, stream: MediaStream) => void }).addStream.bind(recorder);

  addStream('local', fakeAudioStream('local'));
  addStream('dropped-peer', fakeAudioStream('dropped'));
  addStream('active-peer', fakeAudioStream('active-old'));
  assert.deepEqual(
    recorder.recordedClientIds().sort(),
    ['active-peer', 'dropped-peer', 'local'],
    'precondition: recorder tracks local plus two remote sources',
  );

  syncRecorderPeerStreams(
    [fakePeer('local-client-id', fakeAudioStream('local-peer'), true), fakePeer('active-peer', fakeAudioStream('active-new'))],
    recorder,
  );

  assert.deepEqual(recorder.recordedClientIds().sort(), ['active-peer', 'local'], 'dropped peer source is evicted from recorder-tracked ids');
  assert.equal(recorder.sourceCount(), 2, 'sourceCount reflects local plus active remote after drop eviction');
  assert.equal(sources[0].disconnectCount, 0, 'local recorder source is not removed by remote-peer eviction');
  assert.equal(sources[1].disconnectCount, 1, 'dropped peer source is disconnected');
  assert.equal(sources[2].disconnectCount, 1, 'active peer old source is replaced by the fresh stream');
}

console.log('recorder-leaks: all assertions passed');
