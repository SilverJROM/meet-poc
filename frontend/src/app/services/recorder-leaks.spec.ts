import assert from 'node:assert/strict';
import { signal } from '@angular/core';
import { RecorderService, resolveRecordingMime } from './recorder.service.js';
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
  (recorder as unknown as { mimeType: string }).mimeType = 'audio/webm';
  (recorder as unknown as { extension: string }).extension = 'webm';
  (recorder as unknown as { recordingStartedAt: number }).recordingStartedAt = Date.now();
  (recorder as unknown as { recordingDurationMs: number }).recordingDurationMs = 0;
  (recorder as unknown as { metadataContext: unknown | null }).metadataContext = null;
  (recorder as unknown as { participants: Map<string, unknown> }).participants = new Map();
  (recorder as unknown as { segments: unknown[] }).segments = [];
  (recorder as unknown as { openSegment: unknown | null }).openSegment = null;
  (recorder as unknown as { stopInFlight: boolean }).stopInFlight = false;
  (recorder as unknown as { finalized: boolean }).finalized = false;
  (recorder as unknown as { pendingStopResolve: ((blob: Blob) => void) | null }).pendingStopResolve = null;
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

function fakeNoAudioStream(label: string): MediaStream {
  return {
    id: label,
    getAudioTracks: () => [],
    getTracks: () => [],
  } as unknown as MediaStream;
}

function installCleanupSpy(service: RecorderService): { cleanupCount: () => number } {
  let cleanupCount = 0;
  (service as unknown as { cleanupAudioGraph: () => void }).cleanupAudioGraph = () => {
    cleanupCount += 1;
  };
  return { cleanupCount: () => cleanupCount };
}

function installRecorder(service: RecorderService, mimeType = 'audio/webm'): { recorder: MediaRecorder & { stopCount: number }; fireStop: () => void } {
  const fakeRecorder = {
    state: 'recording' as RecordingState,
    mimeType,
    onstop: null as (() => void) | null,
    stopCount: 0,
    stop() {
      this.stopCount += 1;
      this.state = 'inactive' as RecordingState;
    },
  } as MediaRecorder & { stopCount: number };
  (service as unknown as { recorder: MediaRecorder }).recorder = fakeRecorder;
  return {
    recorder: fakeRecorder,
    fireStop: () => fakeRecorder.onstop?.(),
  };
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

// REC5 — stop-then-discard finalizes once, does not double-call MediaRecorder.stop, and late onstop is harmless.
{
  const recorder = createRecorder();
  const cleanup = installCleanupSpy(recorder);
  const media = installRecorder(recorder, 'audio/webm;codecs=opus');
  (recorder as unknown as { chunks: Blob[] }).chunks = [new Blob(['audio'], { type: 'audio/webm' })];

  const stopped = recorder.stop();
  assert.equal(media.recorder.stopCount, 1, 'stop() calls MediaRecorder.stop once');

  recorder.discard();
  assert.equal(media.recorder.stopCount, 1, 'discard() does not call MediaRecorder.stop again while stop is pending');
  assert.equal(cleanup.cleanupCount(), 1, 'discard during pending stop cleans up exactly once');
  assert.equal(recorder.isRecording(), false, 'discard clears recording state');

  media.fireStop();
  const blob = await stopped;
  assert.equal(blob.type, 'audio/webm;codecs=opus', 'pending stop resolves using the negotiated recorder mime');
  assert.equal(cleanup.cleanupCount(), 1, 'late onstop after discard does not clean up again');
}

// REC5 — discard on an active recorder tears down once; a browser onstop delivered afterwards is a no-op.
{
  const recorder = createRecorder();
  const cleanup = installCleanupSpy(recorder);
  const media = installRecorder(recorder, 'audio/webm');

  recorder.discard();
  assert.equal(media.recorder.stopCount, 1, 'discard() stops an active recorder once');
  assert.equal(cleanup.cleanupCount(), 1, 'discard() cleans up exactly once');
  assert.equal(recorder.isRecording(), false, 'discard() clears recording state');

  media.fireStop();
  assert.equal(cleanup.cleanupCount(), 1, 'late onstop after discard-only path remains a no-op');
}

// REC6 — no-audio streams remain skipped, but the skip is observable.
{
  const recorder = createRecorder();
  installFakeGraph(recorder);
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  try {
    const addStream = (recorder as unknown as { addStream: (clientId: string, stream: MediaStream) => void }).addStream.bind(recorder);
    addStream('local', fakeNoAudioStream('silent-local'));
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(recorder.sourceCount(), 0, 'no-audio stream is still skipped');
  assert.equal(warnings.length, 1, 'no-audio skip emits one warning');
  assert.equal(warnings[0][0], 'recording stream skipped: no audio tracks', 'warning names the no-audio skip');
  assert.deepEqual(warnings[0][1], { clientId: 'local' }, 'warning includes local/clientId context');
}

// REC8 — actual recorder mime wins over fallback and maps to playback-friendly extensions.
{
  assert.deepEqual(
    resolveRecordingMime('audio/ogg; codecs=opus', 'audio/webm;codecs=opus', 'webm'),
    { mimeType: 'audio/ogg; codecs=opus', extension: 'ogg' },
    'Firefox-style ogg output is labeled ogg even when selected fallback was webm',
  );
  assert.deepEqual(resolveRecordingMime('audio/webm;codecs=opus', 'audio/ogg', 'ogg'), { mimeType: 'audio/webm;codecs=opus', extension: 'webm' });
  assert.deepEqual(resolveRecordingMime('audio/mp4;codecs=mp4a.40.2', 'audio/webm', 'webm'), {
    mimeType: 'audio/mp4;codecs=mp4a.40.2',
    extension: 'mp4',
  });
  assert.deepEqual(
    resolveRecordingMime('audio/x-browser-format', 'audio/ogg;codecs=opus', 'webm'),
    { mimeType: 'audio/x-browser-format', extension: 'ogg' },
    'unknown negotiated mime keeps the actual Content-Type and falls back to the known extension',
  );
}

// REC8 — blob type, stored extension, and upload headers use the actual recorder mime.
{
  const recorder = createRecorder();
  installCleanupSpy(recorder);
  const media = installRecorder(recorder, 'audio/ogg; codecs=opus');
  (recorder as unknown as { mimeType: string }).mimeType = 'audio/webm';
  (recorder as unknown as { extension: string }).extension = 'webm';
  (recorder as unknown as { chunks: Blob[] }).chunks = [new Blob(['audio'], { type: 'audio/webm' })];

  const stopped = recorder.stop();
  media.fireStop();
  const blob = await stopped;
  assert.equal(blob.type, 'audio/ogg; codecs=opus', 'recording blob uses actual MediaRecorder mime');
  assert.equal(recorder.lastRecordingMime(), 'audio/ogg; codecs=opus', 'stored mime follows actual MediaRecorder mime');
  assert.equal(recorder.lastRecordingExtension(), 'ogg', 'stored extension follows actual MediaRecorder mime');

  const originalFetch = globalThis.fetch;
  let headers: HeadersInit | undefined;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    headers = init?.headers;
    return {
      ok: true,
      json: async () => ({ ok: true, file: 'recording.ogg', bytes: blob.size }),
    } as Response;
  }) as typeof fetch;
  try {
    await recorder.upload(blob, 'room-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal((headers as Record<string, string>)['Content-Type'], 'audio/ogg; codecs=opus', 'upload Content-Type uses actual blob mime');
  assert.equal((headers as Record<string, string>)['X-Ext'], 'ogg', 'upload extension uses actual blob mime');
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
