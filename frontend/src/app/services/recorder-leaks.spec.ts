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

type FakeRecorder = {
  state: RecordingState;
  mimeType: string;
  onstop: ((event: Event) => void) | null;
  stopCount: number;
  stop: () => void;
};

function createRecorder(): RecorderService {
  const recorder = Object.create(RecorderService.prototype) as RecorderService;
  (recorder as unknown as { sourceFor: Map<string, MediaStreamAudioSourceNode> }).sourceFor = new Map();
  (recorder as unknown as { streamFor: Map<string, MediaStream> }).streamFor = new Map();
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

function streamForMap(service: RecorderService): Map<string, MediaStream> {
  return (service as unknown as { streamFor: Map<string, MediaStream> }).streamFor;
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

function installRecorder(service: RecorderService, mimeType = 'audio/webm'): { recorder: FakeRecorder; fireStop: () => void } {
  const fakeRecorder: FakeRecorder = {
    state: 'recording' as RecordingState,
    mimeType,
    onstop: null,
    stopCount: 0,
    stop(): void {
      this.stopCount += 1;
      this.state = 'inactive' as RecordingState;
    },
  };
  (service as unknown as { recorder: MediaRecorder }).recorder = fakeRecorder as unknown as MediaRecorder;
  return {
    recorder: fakeRecorder,
    fireStop: () => fakeRecorder.onstop?.(new Event('stop')),
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

// REC1-iOS — lifecycle resume resumes a suspended recording AudioContext.
{
  let resumeCount = 0;
  const recorder = createRecorder();
  const ctx = {
    state: 'suspended' as AudioContextState,
    resume: async () => {
      resumeCount += 1;
      ctx.state = 'running' as AudioContextState;
    },
  };
  (recorder as unknown as { ctx: unknown }).ctx = ctx;

  await recorder.resumeAudioContext();

  assert.equal(resumeCount, 1, 'suspended recording context is resumed once');
  assert.equal(ctx.state, 'running', 'resumeAudioContext awaits the context resume');
}

// REC1-iOS — lifecycle resume is a no-op when not recording or already running.
{
  let resumeCount = 0;
  const recorder = createRecorder();
  const ctx = {
    state: 'suspended' as AudioContextState,
    resume: async () => {
      resumeCount += 1;
    },
  };
  (recorder as unknown as { ctx: unknown }).ctx = ctx;

  recorder.isRecording.set(false);
  await recorder.resumeAudioContext();
  assert.equal(resumeCount, 0, 'not-recording suspended context is not resumed');

  recorder.isRecording.set(true);
  ctx.state = 'running' as AudioContextState;
  await recorder.resumeAudioContext();
  assert.equal(resumeCount, 0, 'running recording context is not resumed');
}

// REC1-iOS — lifecycle resume never throws when the browser rejects resume().
{
  const recorder = createRecorder();
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  const err = new Error('resume rejected');
  (recorder as unknown as { ctx: unknown }).ctx = {
    state: 'suspended' as AudioContextState,
    resume: async () => {
      throw err;
    },
  };
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  try {
    await recorder.resumeAudioContext();
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 1, 'resume rejection is warned once');
  assert.equal(warnings[0][0], 'recording audio context resume failed', 'resume rejection warning names the lifecycle resume failure');
  assert.equal(warnings[0][1], err, 'resume rejection warning preserves the rejected error');
}

// REC2 — re-adding the same stream object is a no-op; a changed stream still replaces the old node.
{
  const recorder = createRecorder();
  const sources = installFakeGraph(recorder);
  const addStream = (recorder as unknown as { addStream: (clientId: string, stream: MediaStream) => void }).addStream.bind(recorder);
  const firstStream = fakeAudioStream('first');
  const replacementStream = fakeAudioStream('replacement');

  addStream('peer-1', firstStream);
  assert.equal(recorder.sourceCount(), 1, 'first peer stream registers one source');
  assert.equal(sources.length, 1, 'first peer stream creates one source node');
  assert.equal(sources[0].connectCount, 1, 'first source is connected to the recorder mix');
  assert.equal(streamForMap(recorder).get('peer-1'), firstStream, 'first peer stream object is tracked with the source');

  addStream('peer-1', firstStream);
  assert.equal(recorder.sourceCount(), 1, 'same-stream re-add keeps sourceCount stable at one for the peer');
  assert.equal(sources.length, 1, 'same-stream re-add creates no replacement source node');
  assert.equal(sources[0].disconnectCount, 0, 'same-stream re-add does not disconnect the retained source');
  assert.equal(streamForMap(recorder).get('peer-1'), firstStream, 'same-stream re-add keeps the tracked stream object');

  addStream('peer-1', replacementStream);
  assert.equal(recorder.sourceCount(), 1, 'replacement keeps sourceCount stable at one for the peer');
  assert.equal(sources.length, 2, 'replacement creates a new source node');
  assert.equal(sources[0].disconnectCount, 1, 'old source is disconnected before replacement is retained');
  assert.equal(sources[1].connectCount, 1, 'replacement source is connected to the recorder mix');
  assert.equal(streamForMap(recorder).get('peer-1'), replacementStream, 'changed stream replaces the tracked stream object');
}

// REC2 — removing a peer clears both sourceFor and streamFor so a later re-add cannot be suppressed by a stale stream reference.
{
  const recorder = createRecorder();
  const sources = installFakeGraph(recorder);
  const addStream = (recorder as unknown as { addStream: (clientId: string, stream: MediaStream) => void }).addStream.bind(recorder);
  const stream = fakeAudioStream('peer-stream');

  addStream('peer-1', stream);
  recorder.removePeerStream('peer-1');
  assert.equal(recorder.sourceCount(), 0, 'removePeerStream clears sourceCount for the removed peer');
  assert.equal(streamForMap(recorder).has('peer-1'), false, 'removePeerStream clears the peer stream reference');
  assert.equal(sources[0].disconnectCount, 1, 'removePeerStream disconnects the removed peer source');

  addStream('peer-1', stream);
  assert.equal(recorder.sourceCount(), 1, 'same object can be legitimately re-added after removal');
  assert.equal(sources.length, 2, 're-add after removal creates a new source node');
  assert.equal(sources[1].connectCount, 1, 're-added source is connected after removal cleared streamFor');
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

// REC2 — room sync with unchanged peer streams does not churn recorder sources and never removes local.
{
  const recorder = createRecorder();
  const sources = installFakeGraph(recorder);
  const addStream = (recorder as unknown as { addStream: (clientId: string, stream: MediaStream) => void }).addStream.bind(recorder);
  const localStream = fakeAudioStream('local');
  const peerStream = fakeAudioStream('peer-same');

  addStream('local', localStream);
  addStream('peer-1', peerStream);
  syncRecorderPeerStreams([fakePeer('local-client-id', localStream, true), fakePeer('peer-1', peerStream)], recorder);

  assert.deepEqual(recorder.recordedClientIds().sort(), ['local', 'peer-1'], 'unchanged sync keeps local plus the active remote recorded');
  assert.equal(recorder.sourceCount(), 2, 'unchanged sync keeps sourceCount stable');
  assert.equal(sources.length, 2, 'unchanged sync creates no replacement source nodes');
  assert.equal(sources[0].disconnectCount, 0, 'local source is untouched by remote-peer sync');
  assert.equal(sources[1].disconnectCount, 0, 'unchanged remote source is not disconnected/reconnected');
}

console.log('recorder-leaks: all assertions passed');
