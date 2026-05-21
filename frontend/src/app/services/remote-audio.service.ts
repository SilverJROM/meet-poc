import { Injectable, inject, signal } from '@angular/core';
import { PlatformService } from './platform.service';
import { PeerState } from './webrtc.service';

type RemoteSource = {
  stream: MediaStream;
  track: MediaStreamTrack;
  source: MediaStreamAudioSourceNode;
  onEnded: () => void;
};

export type RemoteAudioDebugSnapshot = {
  mixerEnabled: boolean;
  contextState: AudioContextState | 'none';
  outputAttached: boolean;
  outputPaused: boolean;
  mixedPeerIds: string[];
  mixedTrackIds: string[];
};

@Injectable({ providedIn: 'root' })
export class RemoteAudioService {
  readonly contextState = signal<AudioContextState | 'none'>('none');

  private readonly platform = inject(PlatformService);
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private outputElement: HTMLAudioElement | null = null;
  private readonly sources = new Map<string, RemoteSource>();

  mixerEnabled(): boolean {
    return this.platform.isIOS();
  }

  attachOutputElement(element: HTMLAudioElement | null): void {
    this.outputElement = element;
    if (!element || !this.mixerEnabled()) return;
    this.bindOutputElement();
  }

  syncPeers(peers: PeerState[]): void {
    if (!this.mixerEnabled()) {
      this.clearSources();
      return;
    }

    const remoteAudioPeers = peers
      .filter((peer) => !peer.isLocal)
      .map((peer) => ({ id: peer.id, stream: peer.stream, track: currentAudioTrack(peer.stream) }))
      .filter((peer): peer is { id: string; stream: MediaStream; track: MediaStreamTrack } => !!peer.stream && !!peer.track);
    const nextIds = new Set(remoteAudioPeers.map((peer) => peer.id));

    for (const id of [...this.sources.keys()]) {
      if (!nextIds.has(id)) this.removeSource(id);
    }

    for (const peer of remoteAudioPeers) {
      const current = this.sources.get(peer.id);
      if (current?.stream === peer.stream && current.track === peer.track) continue;
      this.removeSource(peer.id);
      this.addSource(peer.id, peer.stream, peer.track);
    }

    if (remoteAudioPeers.length > 0) this.bindOutputElement();
  }

  async unlockAndPlayRemoteSinks(deviceId?: string): Promise<boolean> {
    if (this.mixerEnabled()) {
      this.ensureGraph();
      await this.resumeContext();
      await this.applySinkId(this.outputElement, deviceId);
    }

    let allPlayable = true;
    const elements = Array.from(document.querySelectorAll<HTMLAudioElement>('audio[data-remote-audio]'));
    await Promise.all(
      elements.map(async (audio) => {
        await this.applySinkId(audio, deviceId);
        try {
          await audio.play();
        } catch (err) {
          allPlayable = false;
          console.debug('[media] remote audio element still blocked after user gesture', err);
        }
        if (audio.paused) allPlayable = false;
      }),
    );

    if (this.mixerEnabled() && this.sources.size > 0) {
      const output = this.outputElement;
      if (!output) return false;
      this.bindOutputElement();
      try {
        await output.play();
      } catch (err) {
        allPlayable = false;
        console.debug('[media] remote audio mixer still blocked after user gesture', err);
      }
      if (output.paused) allPlayable = false;
    }

    return allPlayable;
  }

  async applyOutputDevice(deviceId: string): Promise<void> {
    if (!this.mixerEnabled()) return;
    await this.applySinkId(this.outputElement, deviceId);
  }

  allSinksPlaying(): boolean {
    const elements = Array.from(document.querySelectorAll<HTMLAudioElement>('audio[data-remote-audio]'));
    const perPeerPlaying = elements.every((audio) => !audio.paused);
    if (!this.mixerEnabled()) return perPeerPlaying;
    if (this.sources.size === 0) return perPeerPlaying;
    return perPeerPlaying && !!this.outputElement && !this.outputElement.paused;
  }

  debugSnapshot(): RemoteAudioDebugSnapshot {
    return {
      mixerEnabled: this.mixerEnabled(),
      contextState: this.context?.state ?? 'none',
      outputAttached: !!this.outputElement,
      outputPaused: this.outputElement?.paused ?? true,
      mixedPeerIds: [...this.sources.keys()],
      mixedTrackIds: [...this.sources.values()].map((source) => source.track.id),
    };
  }

  reset(): void {
    this.clearSources();
    this.outputElement = null;
    this.gain?.disconnect();
    this.destination?.disconnect();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => undefined);
    this.context = null;
    this.gain = null;
    this.destination = null;
    this.contextState.set('none');
  }

  private addSource(id: string, stream: MediaStream, track: MediaStreamTrack): void {
    try {
      const context = this.ensureGraph();
      const source = context.createMediaStreamSource(new MediaStream([track]));
      source.connect(this.gain!);
      const onEnded = () => this.removeSource(id);
      track.addEventListener('ended', onEnded, { once: true });
      this.sources.set(id, { stream, track, source, onEnded });
    } catch (err) {
      console.debug('[media] remote audio mixer source failed', err);
    }
  }

  private removeSource(id: string): void {
    const current = this.sources.get(id);
    if (!current) return;
    current.track.removeEventListener('ended', current.onEnded);
    try {
      current.source.disconnect();
    } catch {
      // best effort
    }
    this.sources.delete(id);
  }

  private clearSources(): void {
    for (const id of [...this.sources.keys()]) this.removeSource(id);
  }

  private ensureGraph(): AudioContext {
    if (!this.context || this.context.state === 'closed') {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContextCtor();
      this.context.onstatechange = () => this.contextState.set(this.context?.state ?? 'none');
      this.contextState.set(this.context.state);
    }
    if (!this.gain) {
      this.gain = this.context.createGain();
      this.gain.gain.value = 1;
    }
    if (!this.destination) {
      this.destination = this.context.createMediaStreamDestination();
      this.gain.connect(this.destination);
    }
    return this.context;
  }

  private bindOutputElement(): void {
    if (!this.outputElement) return;
    const context = this.ensureGraph();
    if (this.destination && this.outputElement.srcObject !== this.destination.stream) this.outputElement.srcObject = this.destination.stream;
    this.outputElement.muted = false;
    this.contextState.set(context.state);
  }

  private async resumeContext(): Promise<void> {
    if (!this.context || this.context.state === 'closed') return;
    if (this.context.state === 'suspended') await this.context.resume();
    this.contextState.set(this.context.state);
  }

  private async applySinkId(element: HTMLMediaElement | null, deviceId?: string): Promise<void> {
    if (!element || !deviceId) return;
    const withSink = element as HTMLMediaElement & { setSinkId?: (sinkId: string) => Promise<void> };
    if (withSink.setSinkId) await withSink.setSinkId(deviceId);
  }
}

function currentAudioTrack(stream: MediaStream | null): MediaStreamTrack | null {
  const tracks = stream?.getAudioTracks() ?? [];
  return tracks.find((track) => track.readyState !== 'ended') ?? tracks[0] ?? null;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
