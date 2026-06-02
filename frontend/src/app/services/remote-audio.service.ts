import { Injectable, signal } from '@angular/core';
import { PeerState } from './peer-state';
import { evaluateRemoteAudioPlayability } from './remote-audio-playability';

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
  mutedAll: boolean;
  volume: number;
  mixedPeerIds: string[];
  mixedTrackIds: string[];
};

const VOLUME_STORAGE_KEY = 'meet-poc:volume:value';
const DEFAULT_VOLUME = 1;
const MAX_VOLUME = 1.3;

// B2 — brick-wall limiter taming runaway same-room feedback peaks. dB / dB / :1 / s / s.
// NO makeup gain so mute-all (gain=0) stays silent (0 in ⇒ 0 out through the compressor).
export const FEEDBACK_LIMITER_PARAMS = { threshold: -3, knee: 0, ratio: 20, attack: 0.003, release: 0.25 } as const;

@Injectable({ providedIn: 'root' })
export class RemoteAudioService {
  readonly contextState = signal<AudioContextState | 'none'>('none');
  readonly mutedAll = signal(false);
  readonly volume = signal(DEFAULT_VOLUME);
  // Bumped whenever a mixer source is added/removed, so reactive consumers (the
  // room-page playability effect) re-evaluate the banner on source-add (R1.3 BUG-2).
  readonly sourcesVersion = signal(0);
  // Tracks whether the mixer output element is genuinely playing (play/pause/ended
  // element events), so the playability effect clears the banner once playout truly
  // settles — not on the transient running-context-but-output-still-pausing window.
  readonly outputPlaying = signal(false);

  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private outputElement: HTMLAudioElement | null = null;
  private readonly sources = new Map<string, RemoteSource>();

  constructor() {
    this.setVolume(readStoredVolume());
  }

  mixerEnabled(): boolean {
    return true;
  }

  setMutedAll(value: boolean): void {
    this.mutedAll.set(value);
    if (this.gain) this.gain.gain.value = value ? 0 : this.volume();
  }

  setVolume(value: number): void {
    const clamped = Math.max(0, Math.min(MAX_VOLUME, Number.isFinite(value) ? value : DEFAULT_VOLUME));
    this.volume.set(clamped);
    persistVolume(clamped);
    if (this.gain && !this.mutedAll()) this.gain.gain.value = clamped;
  }

  attachOutputElement(element: HTMLAudioElement | null): void {
    if (this.outputElement && this.outputElement !== element) this.detachOutputListeners(this.outputElement);
    this.outputElement = element;
    if (!element) {
      this.outputPlaying.set(false);
      return;
    }
    this.attachOutputListeners(element);
    if (!this.mixerEnabled()) return;
    this.bindOutputElement();
  }

  private readonly onOutputPlay = () => this.outputPlaying.set(!!this.outputElement && !this.outputElement.paused);
  private readonly onOutputPause = () => this.outputPlaying.set(false);

  private attachOutputListeners(element: HTMLAudioElement): void {
    element.addEventListener('playing', this.onOutputPlay);
    element.addEventListener('play', this.onOutputPlay);
    element.addEventListener('pause', this.onOutputPause);
    element.addEventListener('ended', this.onOutputPause);
    this.outputPlaying.set(!element.paused);
  }

  private detachOutputListeners(element: HTMLAudioElement): void {
    element.removeEventListener('playing', this.onOutputPlay);
    element.removeEventListener('play', this.onOutputPlay);
    element.removeEventListener('pause', this.onOutputPause);
    element.removeEventListener('ended', this.onOutputPause);
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
      // R1.3 / NS3: kick off resume() SYNCHRONOUSLY within the gesture call stack,
      // BEFORE the first await, so the browser's transient user-activation isn't
      // lost to a microtask boundary. We capture the promise and await it below to
      // refresh contextState; a non-gesture caller (setTimeout(0)) will simply have
      // the resume rejected, leaving the context non-running ⇒ honest banner.
      const resumePromise =
        this.context && this.context.state === 'suspended'
          ? this.context.resume().catch((err) => {
              console.debug('[media] remote audio context resume rejected (likely non-gesture)', err);
            })
          : Promise.resolve();
      await resumePromise;
      if (this.context && this.context.state !== 'closed') this.contextState.set(this.context.state);
      await this.applySinkId(this.outputElement, deviceId);
    }

    const elements = Array.from(document.querySelectorAll<HTMLAudioElement>('audio[data-remote-audio]'));
    await Promise.all(
      elements.map(async (audio) => {
        await this.applySinkId(audio, deviceId);
        try {
          await audio.play();
        } catch (err) {
          console.debug('[media] remote audio element still blocked after user gesture', err);
        }
      }),
    );

    if (this.mixerEnabled() && this.sources.size > 0) {
      const output = this.outputElement;
      if (output) {
        this.bindOutputElement();
        try {
          await output.play();
        } catch (err) {
          console.debug('[media] remote audio mixer still blocked after user gesture', err);
        }
      }
    }

    // BUG-1 fix: the playability verdict now routes through the pure decision fn,
    // which treats a non-'running' context (with sources) as NOT playable — instead
    // of the old element.paused-only check that returned true for a suspended context.
    const perPeerAllUnpaused = elements.every((audio) => !audio.paused);
    return evaluateRemoteAudioPlayability({
      mixerEnabled: this.mixerEnabled(),
      contextState: this.context?.state ?? 'none',
      sourcesCount: this.sources.size,
      outputAttached: !!this.outputElement,
      outputPaused: this.outputElement?.paused ?? true,
      perPeerAllUnpaused,
    });
  }

  async applyOutputDevice(deviceId: string): Promise<void> {
    if (!this.mixerEnabled()) return;
    await this.applySinkId(this.outputElement, deviceId);
  }

  allSinksPlaying(): boolean {
    const elements = Array.from(document.querySelectorAll<HTMLAudioElement>('audio[data-remote-audio]'));
    const perPeerAllUnpaused = elements.every((audio) => !audio.paused);
    return evaluateRemoteAudioPlayability({
      mixerEnabled: this.mixerEnabled(),
      contextState: this.context?.state ?? 'none',
      sourcesCount: this.sources.size,
      outputAttached: !!this.outputElement,
      outputPaused: this.outputElement?.paused ?? true,
      perPeerAllUnpaused,
    });
  }

  /**
   * Test-only: drive the live AudioContext into 'suspended' so an e2e can model the
   * autoplay-blocked / suspended-with-sources reality (BUG-1 negative path). Guarded
   * to localhost at the call site (room.page.ts debug object). No-op if no context.
   */
  async suspendForTest(): Promise<void> {
    if (!this.context || this.context.state !== 'running') return;
    await this.context.suspend();
    this.contextState.set(this.context.state);
  }

  /**
   * Test-only: mount a REAL MediaStreamAudioSourceNode for a synthetic remote audio
   * stream into the live mixer graph, exercising the genuine sources.size > 0
   * running-required playability branch end-to-end without depending on a flaky
   * cross-context WebRTC peer connection in headless CI. Guarded to localhost at the
   * call site (room.page.ts debug object). Mirrors active-speaker's injectDebugStream.
   */
  injectRemoteSourceForTest(id: string, stream: MediaStream): void {
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    this.removeSource(id);
    this.addSource(id, stream, track);
    this.bindOutputElement();
  }

  removeRemoteSourceForTest(id: string): void {
    this.removeSource(id);
  }

  debugSnapshot(): RemoteAudioDebugSnapshot {
    return {
      mixerEnabled: this.mixerEnabled(),
      contextState: this.context?.state ?? 'none',
      outputAttached: !!this.outputElement,
      outputPaused: this.outputElement?.paused ?? true,
      mutedAll: this.mutedAll(),
      volume: this.volume(),
      mixedPeerIds: [...this.sources.keys()],
      mixedTrackIds: [...this.sources.values()].map((source) => source.track.id),
    };
  }

  reset(): void {
    this.clearSources();
    this.outputElement = null;
    this.gain?.disconnect();
    this.limiter?.disconnect();
    this.destination?.disconnect();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => undefined);
    this.context = null;
    this.gain = null;
    this.limiter = null;
    this.destination = null;
    this.mutedAll.set(false);
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
      this.sourcesVersion.update((v) => v + 1);
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
    this.sourcesVersion.update((v) => v + 1);
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
      this.gain.gain.value = this.mutedAll() ? 0 : this.volume();
    }
    if (!this.limiter) {
      // Brick-wall limiter downstream of the volume/mute gain: caps runaway same-room
      // feedback peaks WITHOUT makeup gain, so gain=0 (mute-all) still yields silence.
      this.limiter = this.context.createDynamicsCompressor();
      this.limiter.threshold.value = FEEDBACK_LIMITER_PARAMS.threshold;
      this.limiter.knee.value = FEEDBACK_LIMITER_PARAMS.knee;
      this.limiter.ratio.value = FEEDBACK_LIMITER_PARAMS.ratio;
      this.limiter.attack.value = FEEDBACK_LIMITER_PARAMS.attack;
      this.limiter.release.value = FEEDBACK_LIMITER_PARAMS.release;
    }
    if (!this.destination) {
      this.destination = this.context.createMediaStreamDestination();
      // Chain: source(s) → gain (volume/mute) → limiter (peak cap) → destination.
      this.gain.connect(this.limiter);
      this.limiter.connect(this.destination);
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

function readStoredVolume(): number {
  try {
    const stored = window.localStorage.getItem(VOLUME_STORAGE_KEY);
    if (!stored) return DEFAULT_VOLUME;
    const parsed = Number.parseFloat(stored);
    return Number.isFinite(parsed) ? parsed : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

function persistVolume(value: number): void {
  try {
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(value));
  } catch {
    // best effort
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
