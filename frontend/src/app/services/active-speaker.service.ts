import { Injectable, signal } from '@angular/core';
import { PeerState } from './webrtc.service';

type SpeakerAnalyzer = {
  stream: MediaStream;
  pc: RTCPeerConnection | null;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  sink: GainNode;
  buffer: Uint8Array<ArrayBuffer>;
  processorTrack?: MediaStreamTrack;
  processorReader?: ReadableStreamDefaultReader<AudioData>;
  processorRms: number;
  processorStopped: boolean;
};

@Injectable({ providedIn: 'root' })
export class ActiveSpeakerService {
  readonly activePeerId = signal<string | null>(null);
  readonly activeSpeakerHz = signal(0);
  readonly analyzerCount = signal(0);
  readonly lastMaxRms = signal(0);
  readonly contextState = signal<AudioContextState | 'none'>('none');
  readonly activeFrame = signal<{ id: string | null; at: number; rms: number; seq: number }>({ id: null, at: Date.now(), rms: 0, seq: 0 });

  private context: AudioContext | null = null;
  private readonly analyzers = new Map<string, SpeakerAnalyzer>();
  private interval: ReturnType<typeof setInterval> | null = null;
  private measuring = false;
  private ticksInWindow = 0;
  private windowStartedAt = Date.now();
  private forcedActivePeerIdForTest: string | null | undefined;

  unlock(): void {
    const context = this.ensureContext();
    if (context.state === 'suspended') {
      void context.resume().catch(() => undefined);
    }
  }

  observe(peers: PeerState[]): void {
    const audiblePeers = peers.filter((peer) => peer.stream?.getAudioTracks().length);
    const ids = new Set(audiblePeers.map((peer) => peer.id));

    for (const id of [...this.analyzers.keys()]) {
      if (!ids.has(id)) this.remove(id);
    }

    for (const peer of audiblePeers) {
      if (peer.stream && this.analyzers.get(peer.id)?.stream !== peer.stream) {
        this.remove(peer.id);
        this.add(peer);
      }
    }

    if (this.analyzers.size > 0) this.start();
    if (this.analyzers.size === 0) {
      this.stop();
      this.activePeerId.set(null);
    }
  }

  reset(): void {
    this.stop();
    for (const id of [...this.analyzers.keys()]) this.remove(id);
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => undefined);
    this.context = null;
    this.activePeerId.set(null);
    this.activeSpeakerHz.set(0);
    this.analyzerCount.set(0);
    this.lastMaxRms.set(0);
    this.activeFrame.set({ id: null, at: Date.now(), rms: 0, seq: this.activeFrame().seq + 1 });
    this.contextState.set('none');
    this.forcedActivePeerIdForTest = undefined;
  }

  injectDebugStream(id: string, stream: MediaStream): void {
    this.remove(id);
    this.add({
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
    });
    this.start();
  }

  forceActivePeerForTest(id: string | null): void {
    this.forcedActivePeerIdForTest = id;
    const now = Date.now();
    this.activePeerId.set(id);
    this.activeFrame.set({ id, at: now, rms: id ? 1 : 0, seq: this.activeFrame().seq + 1 });
  }

  private add(peer: PeerState): void {
    const stream = peer.stream;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    try {
      const context = this.ensureContext();
      if (context.state === 'suspended') void context.resume().catch(() => undefined);
      const analyser = context.createAnalyser();
      const sink = context.createGain();
      analyser.fftSize = 512;
      sink.gain.value = 0;
      const source = context.createMediaStreamSource(new MediaStream([track]));
      source.connect(analyser);
      analyser.connect(sink);
      sink.connect(context.destination);
      const entry: SpeakerAnalyzer = {
        stream,
        pc: peer.pc,
        source,
        analyser,
        sink,
        buffer: new Uint8Array(analyser.fftSize),
        processorRms: 0,
        processorStopped: false,
      };
      this.analyzers.set(peer.id, entry);
      this.startProcessor(track, entry);
      this.analyzerCount.set(this.analyzers.size);
    } catch (err) {
      console.warn('active speaker analyzer failed', err);
    }
  }

  private remove(id: string): void {
    const current = this.analyzers.get(id);
    if (!current) return;
    current.processorStopped = true;
    void current.processorReader?.cancel().catch(() => undefined);
    current.processorTrack?.stop();
    try {
      current.source.disconnect();
      current.analyser.disconnect();
      current.sink.disconnect();
    } catch {
      // best effort
    }
    this.analyzers.delete(id);
    this.analyzerCount.set(this.analyzers.size);
    if (this.activePeerId() === id) this.activePeerId.set(null);
  }

  private start(): void {
    if (this.interval) return;
    this.windowStartedAt = Date.now();
    this.ticksInWindow = 0;
    this.interval = setInterval(() => void this.measure(), 125);
  }

  private stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  private async measure(): Promise<void> {
    if (this.measuring) return;
    this.measuring = true;
    try {
      this.ticksInWindow += 1;
      const now = Date.now();
      if (now - this.windowStartedAt >= 1000) {
        this.activeSpeakerHz.set((this.ticksInWindow * 1000) / Math.max(1, now - this.windowStartedAt));
        this.windowStartedAt = now;
        this.ticksInWindow = 0;
      }

      const thresholdRms = 0.01;
      if (this.forcedActivePeerIdForTest !== undefined) {
        const forcedId = this.forcedActivePeerIdForTest;
        this.lastMaxRms.set(forcedId ? 1 : 0);
        this.activePeerId.set(forcedId);
        this.activeFrame.set({ id: forcedId, at: now, rms: forcedId ? 1 : 0, seq: this.activeFrame().seq + 1 });
        return;
      }
      let activeId: string | null = null;
      let activeRms = thresholdRms;
      let maxObservedRms = 0;
      for (const [id, entry] of this.analyzers) {
        entry.analyser.getByteTimeDomainData(entry.buffer);
        let sum = 0;
        for (const sample of entry.buffer) {
          const centered = (sample - 128) / 128;
          sum += centered * centered;
        }
        const webAudioRms = Math.sqrt(sum / entry.buffer.length);
        const rms = Math.max(webAudioRms, entry.processorRms, await this.inboundAudioLevel(entry.pc));
        maxObservedRms = Math.max(maxObservedRms, rms);
        if (rms > activeRms) {
          activeRms = rms;
          activeId = id;
        }
      }
      this.lastMaxRms.set(maxObservedRms);
      this.activePeerId.set(activeId);
      this.activeFrame.set({ id: activeId, at: now, rms: activeRms, seq: this.activeFrame().seq + 1 });
    } finally {
      this.measuring = false;
    }
  }

  private async inboundAudioLevel(pc: RTCPeerConnection | null): Promise<number> {
    if (!pc) return 0;
    try {
      const stats = await pc.getStats();
      let level = 0;
      stats.forEach((report) => {
        const item = report as RTCInboundRtpStreamStats & { kind?: string; mediaType?: string; audioLevel?: number };
        if (item.type !== 'inbound-rtp' || (item.kind ?? item.mediaType) !== 'audio') return;
        if (typeof item.audioLevel === 'number') level = Math.max(level, item.audioLevel);
      });
      return level;
    } catch {
      return 0;
    }
  }

  private startProcessor(track: MediaStreamTrack, entry: SpeakerAnalyzer): void {
    const ProcessorCtor = (window as unknown as {
      MediaStreamTrackProcessor?: new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<AudioData> };
    }).MediaStreamTrackProcessor;
    if (!ProcessorCtor) return;
    try {
      entry.processorTrack = track.clone();
      entry.processorReader = new ProcessorCtor({ track: entry.processorTrack }).readable.getReader();
      void this.readProcessor(entry);
    } catch {
      entry.processorTrack?.stop();
      entry.processorTrack = undefined;
      entry.processorReader = undefined;
    }
  }

  private async readProcessor(entry: SpeakerAnalyzer): Promise<void> {
    const reader = entry.processorReader;
    if (!reader) return;
    while (!entry.processorStopped) {
      const result = await reader.read().catch(() => null);
      if (!result || result.done || !result.value) break;
      const audioData = result.value;
      try {
        const data = new Float32Array(audioData.numberOfFrames);
        audioData.copyTo(data, { planeIndex: 0 });
        let sum = 0;
        for (const sample of data) sum += sample * sample;
        entry.processorRms = Math.sqrt(sum / Math.max(1, data.length));
      } catch {
        entry.processorRms = 0;
      } finally {
        audioData.close();
      }
    }
  }

  private ensureContext(): AudioContext {
    if (!this.context || this.context.state === 'closed') {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContextCtor();
    }
    this.contextState.set(this.context.state);
    this.context.onstatechange = () => this.contextState.set(this.context?.state ?? 'none');
    return this.context;
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
