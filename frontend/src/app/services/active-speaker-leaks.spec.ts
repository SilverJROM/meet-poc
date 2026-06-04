import assert from 'node:assert/strict';
import { ActiveSpeakerService } from './active-speaker.service.js';
import type { PeerState } from './peer-state.js';

type FakeNode = {
  connectCount: number;
  disconnectCount: number;
  connect: (node: unknown) => void;
  disconnect: () => void;
};

function fakeNode(): FakeNode {
  const node: FakeNode = {
    connectCount: 0,
    disconnectCount: 0,
    connect: () => {
      node.connectCount += 1;
    },
    disconnect: () => {
      node.disconnectCount += 1;
    },
  };
  return node;
}

function installAudioContext(): { sources: FakeNode[]; analysers: FakeNode[]; sinks: FakeNode[] } {
  const sources: FakeNode[] = [];
  const analysers: FakeNode[] = [];
  const sinks: FakeNode[] = [];
  class FakeMediaStream {
    constructor(readonly tracks: unknown[]) {}
    getAudioTracks(): unknown[] {
      return this.tracks;
    }
  }
  class FakeAudioContext {
    state: AudioContextState = 'running';
    destination = {};
    onstatechange: (() => void) | null = null;
    createAnalyser(): FakeNode & { fftSize: number; getByteTimeDomainData: (buffer: Uint8Array) => void } {
      const analyser = Object.assign(fakeNode(), {
        fftSize: 0,
        getByteTimeDomainData: (buffer: Uint8Array) => buffer.fill(128),
      });
      analysers.push(analyser);
      return analyser;
    }
    createGain(): FakeNode & { gain: { value: number } } {
      const sink = Object.assign(fakeNode(), { gain: { value: 1 } });
      sinks.push(sink);
      return sink;
    }
    createMediaStreamSource(): FakeNode {
      const source = fakeNode();
      sources.push(source);
      return source;
    }
    resume(): Promise<void> {
      return Promise.resolve();
    }
    close(): Promise<void> {
      this.state = 'closed';
      return Promise.resolve();
    }
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { AudioContext: FakeAudioContext },
  });
  Object.defineProperty(globalThis, 'MediaStream', {
    configurable: true,
    value: FakeMediaStream,
  });
  return { sources, analysers, sinks };
}

function fakePeer(id: string, stream: MediaStream): PeerState {
  return {
    id,
    participantId: id,
    stream,
    pc: null,
    name: id,
    connectionState: 'connected',
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
    isLocal: false,
    isHost: false,
    micEnabled: true,
    camEnabled: false,
    screenOn: false,
    reconnecting: false,
    reconnectingSince: null,
    isMobile: false,
  };
}

function fakeStream(label: string): MediaStream {
  return {
    id: label,
    getAudioTracks: () => [{ kind: 'audio', readyState: 'live' }],
    getTracks: () => [{ kind: 'audio', readyState: 'live' }],
  } as unknown as MediaStream;
}

// LEAK3 — re-adding a peer replaces the old analyser graph and removal disconnects the retained graph.
{
  const graph = installAudioContext();
  const service = new ActiveSpeakerService();
  const add = (service as unknown as { add: (peer: PeerState) => void }).add.bind(service);
  const remove = (service as unknown as { remove: (id: string) => void }).remove.bind(service);

  add(fakePeer('peer-1', fakeStream('first')));
  assert.equal(service.analyzerCount(), 1, 'first peer creates one analyser entry');

  add(fakePeer('peer-1', fakeStream('replacement')));
  assert.equal(service.analyzerCount(), 1, 'replacement keeps exactly one analyser entry for the peer');
  assert.equal(graph.sources[0].disconnectCount, 1, 'old source is disconnected during replacement');
  assert.equal(graph.analysers[0].disconnectCount, 1, 'old analyser is disconnected during replacement');
  assert.equal(graph.sinks[0].disconnectCount, 1, 'old sink is disconnected during replacement');

  remove('peer-1');
  assert.equal(service.analyzerCount(), 0, 'removal clears the analyser entry');
  assert.equal(graph.sources[1].disconnectCount, 1, 'retained replacement source is disconnected on removal');
  assert.equal(graph.analysers[1].disconnectCount, 1, 'retained replacement analyser is disconnected on removal');
  assert.equal(graph.sinks[1].disconnectCount, 1, 'retained replacement sink is disconnected on removal');
}

console.log('active-speaker-leaks: all assertions passed');
