import { Injectable, signal } from '@angular/core';
import { PeerState } from './peer-state';
import { evaluateRemoteAudioPlayability } from './remote-audio-playability';

type RemoteSource = {
  stream: MediaStream;
  track: MediaStreamTrack;
  source: MediaStreamAudioSourceNode;
  kickstartElement: HTMLAudioElement;
  onEnded: () => void;
};

export type VoiceRecoveryAction = 'none' | 'resume' | 'kickstart' | 'replay' | 'rebuild';
export type VoiceRecoveryStep = Exclude<VoiceRecoveryAction, 'none'>;

export type VoiceRecoverySample = {
  bytes: number;
  emitted: number;
};

export type VoiceRecoveryDecisionInput = {
  samples: VoiceRecoverySample[];
  attemptsThisWindow: number;
  mutedAll: boolean;
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
  kickstartCount: number;
  kickstartPlayingCount: number;
  voiceRecoveryCounters: Record<VoiceRecoveryStep, number>;
};

const VOLUME_STORAGE_KEY = 'meet-poc:volume:value';
export const AUDIO_OUTPUT_DEVICE_STORAGE_KEY = 'meet-poc.device.audioOutput';
const DEFAULT_VOLUME = 1;
const MAX_VOLUME = 1.3;
export const VOICE_RECOVERY_SAMPLE_WINDOW = 4;
export const VOICE_RECOVERY_MAX_ATTEMPTS_PER_WINDOW = 4;
export const VOICE_RECOVERY_MIN_BYTES_DELTA = 0;
export const VOICE_RECOVERY_MAX_EMITTED_DELTA = 0;

// B2 — brick-wall limiter taming runaway same-room feedback peaks. dB / dB / :1 / s / s.
// NO makeup gain so mute-all (gain=0) stays silent (0 in ⇒ 0 out through the compressor).
export const FEEDBACK_LIMITER_PARAMS = { threshold: -3, knee: 0, ratio: 20, attack: 0.003, release: 0.25 } as const;

export function decideVoiceRecovery(input: VoiceRecoveryDecisionInput): VoiceRecoveryAction {
  if (input.mutedAll) return 'none';
  if (input.attemptsThisWindow >= VOICE_RECOVERY_MAX_ATTEMPTS_PER_WINDOW) return 'none';
  if (input.samples.length < VOICE_RECOVERY_SAMPLE_WINDOW) return 'none';

  const first = input.samples[0];
  const last = input.samples[input.samples.length - 1];
  if (!sampleUsable(first) || !sampleUsable(last)) return 'none';

  const bytesDelta = last.bytes - first.bytes;
  const emittedDelta = last.emitted - first.emitted;
  if (bytesDelta <= VOICE_RECOVERY_MIN_BYTES_DELTA) return 'none';
  if (emittedDelta > VOICE_RECOVERY_MAX_EMITTED_DELTA) return 'none';

  if (input.attemptsThisWindow === 0) return 'resume';
  if (input.attemptsThisWindow === 1) return 'kickstart';
  if (input.attemptsThisWindow === 2) return 'replay';
  return 'rebuild';
}

export type ApplySinkIdOptions = {
  onSelectedSinkFailure?: (deviceId: string, err: unknown) => void;
  label?: string;
};

export async function applyMediaElementSinkWithDefaultFallback(
  element: HTMLMediaElement | null,
  deviceId: string | undefined,
  options: ApplySinkIdOptions = {},
): Promise<boolean> {
  if (!element || deviceId === undefined) return true;
  const withSink = element as HTMLMediaElement & { setSinkId?: (sinkId: string) => Promise<void> };
  if (!withSink.setSinkId) return true;

  try {
    await withSink.setSinkId(deviceId);
    return true;
  } catch (err) {
    console.debug('[media] audio output sink routing failed; falling back to default speaker', {
      deviceId,
      label: options.label,
      err,
    });
    if (deviceId) options.onSelectedSinkFailure?.(deviceId, err);
    if (deviceId === '') return false;
    try {
      await withSink.setSinkId('');
    } catch (fallbackErr) {
      console.debug('[media] default audio output sink fallback failed', { label: options.label, fallbackErr });
    }
    return false;
  }
}

export function clearStoredAudioOutputDeviceId(): void {
  try {
    window.localStorage.removeItem(AUDIO_OUTPUT_DEVICE_STORAGE_KEY);
  } catch {
    // Best effort only.
  }
}

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
  private keepaliveOscillator: OscillatorNode | null = null;
  private keepaliveGain: GainNode | null = null;
  private outputElement: HTMLAudioElement | null = null;
  private readonly sources = new Map<string, RemoteSource>();
  private readonly voiceRecoveryCounters: Record<VoiceRecoveryStep, number> = {
    resume: 0,
    kickstart: 0,
    replay: 0,
    rebuild: 0,
  };

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
    await this.playKickstartElements(deviceId);

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

  async applyOutputDevice(deviceId: string): Promise<boolean> {
    if (!this.mixerEnabled()) return true;
    const outputApplied = await this.applySinkId(this.outputElement, deviceId);
    const kickstartApplied = await Promise.all([...this.sources.values()].map((source) => this.applySinkId(source.kickstartElement, deviceId)));
    return outputApplied && kickstartApplied.every(Boolean);
  }

  async recoverPlayback(deviceId?: string): Promise<boolean> {
    if (!this.mixerEnabled()) return this.allSinksPlaying();
    this.ensureGraph();
    try {
      await this.resumeContext();
    } catch (err) {
      console.debug('[media] remote audio context recovery resume rejected', err);
    }
    await this.playKickstartElements(deviceId);
    const output = this.outputElement;
    if (output) {
      await this.applySinkId(output, deviceId);
      this.bindOutputElement();
      try {
        await output.play();
      } catch (err) {
        console.debug('[media] remote audio mixer recovery play rejected', err);
      }
    }
    this.contextState.set(this.context?.state ?? 'none');
    return this.allSinksPlaying();
  }

  async recoverVoicePlayout(peerId: string, step: VoiceRecoveryStep, deviceId?: string): Promise<void> {
    if (!this.mixerEnabled()) return;
    this.voiceRecoveryCounters[step] += 1;
    console.debug('[media] remote voice watchdog remediation', { peerId, step, count: this.voiceRecoveryCounters[step] });

    if (step === 'resume') {
      this.ensureGraph();
      try {
        await this.resumeContext();
      } catch (err) {
        console.debug('[media] remote voice watchdog context resume rejected', err);
      }
      return;
    }

    if (step === 'kickstart') {
      await this.ensureKickstartPlaying(peerId, deviceId);
      return;
    }

    if (step === 'replay') {
      await this.replayMixerOutput(deviceId);
      return;
    }

    this.rebuildSource(peerId);
    await this.ensureKickstartPlaying(peerId, deviceId);
    await this.replayMixerOutput(deviceId);
  }

  hasSources(): boolean {
    return this.sources.size > 0;
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
      kickstartCount: this.sources.size,
      kickstartPlayingCount: [...this.sources.values()].filter((source) => !source.kickstartElement.paused).length,
      voiceRecoveryCounters: { ...this.voiceRecoveryCounters },
    };
  }

  reset(): void {
    this.clearSources();
    this.outputElement = null;
    this.gain?.disconnect();
    this.limiter?.disconnect();
    this.destination?.disconnect();
    this.stopKeepalive();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => undefined);
    this.context = null;
    this.gain = null;
    this.limiter = null;
    this.destination = null;
    this.mutedAll.set(false);
    this.contextState.set('none');
    this.voiceRecoveryCounters.resume = 0;
    this.voiceRecoveryCounters.kickstart = 0;
    this.voiceRecoveryCounters.replay = 0;
    this.voiceRecoveryCounters.rebuild = 0;
  }

  private addSource(id: string, stream: MediaStream, track: MediaStreamTrack): void {
    try {
      const context = this.ensureGraph();
      const source = context.createMediaStreamSource(new MediaStream([track]));
      source.connect(this.gain!);
      const kickstartElement = this.createKickstartElement(id, stream);
      const onEnded = () => this.removeSource(id);
      track.addEventListener('ended', onEnded, { once: true });
      this.sources.set(id, { stream, track, source, kickstartElement, onEnded });
      this.sourcesVersion.update((v) => v + 1);
      void this.recoverPlayback().catch((err) => console.debug('[media] remote audio source-add recovery failed', err));
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
    this.destroyKickstartElement(current.kickstartElement);
    this.sources.delete(id);
    this.sourcesVersion.update((v) => v + 1);
  }

  private rebuildSource(id: string): void {
    const current = this.sources.get(id);
    if (!current) return;
    const { stream, track } = current;
    this.removeSource(id);
    if (track.readyState === 'ended') return;
    this.addSource(id, stream, track);
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
    this.ensureKeepalive();
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

  private createKickstartElement(id: string, stream: MediaStream): HTMLAudioElement {
    const audio = document.createElement('audio');
    audio.dataset['remoteAudioKickstart'] = id;
    audio.autoplay = true;
    audio.setAttribute('playsinline', '');
    audio.muted = true;
    audio.srcObject = stream;
    audio.style.display = 'none';
    audio.setAttribute('aria-hidden', 'true');
    document.body.append(audio);
    void audio.play().catch((err) => {
      console.debug('[media] remote audio kickstart play rejected', err);
    });
    return audio;
  }

  private destroyKickstartElement(audio: HTMLAudioElement): void {
    try {
      audio.pause();
    } catch {
      // best effort
    }
    audio.srcObject = null;
    audio.remove();
  }

  private async ensureKickstartPlaying(id: string, deviceId?: string): Promise<void> {
    const current = this.sources.get(id);
    if (!current) return;
    if (!current.kickstartElement.isConnected || current.kickstartElement.srcObject !== current.stream) {
      this.destroyKickstartElement(current.kickstartElement);
      current.kickstartElement = this.createKickstartElement(id, current.stream);
    }
    current.kickstartElement.muted = true;
    await this.applySinkId(current.kickstartElement, deviceId);
    try {
      await current.kickstartElement.play();
    } catch (err) {
      console.debug('[media] remote voice watchdog kickstart play rejected', err);
    }
  }

  private async replayMixerOutput(deviceId?: string): Promise<void> {
    const output = this.outputElement;
    if (!output) return;
    this.bindOutputElement();
    await this.applySinkId(output, deviceId);
    try {
      await output.play();
    } catch (err) {
      console.debug('[media] remote voice watchdog mixer replay rejected', err);
    }
  }

  private async playKickstartElements(deviceId?: string): Promise<void> {
    await Promise.all(
      [...this.sources.values()].map(async ({ stream, kickstartElement }) => {
        if (kickstartElement.srcObject !== stream) kickstartElement.srcObject = stream;
        kickstartElement.muted = true;
        await this.applySinkId(kickstartElement, deviceId);
        try {
          await kickstartElement.play();
        } catch (err) {
          console.debug('[media] remote audio kickstart still blocked', err);
        }
      }),
    );
  }

  private ensureKeepalive(): void {
    if (!this.context || !this.destination || this.keepaliveOscillator) return;
    this.keepaliveGain = this.context.createGain();
    this.keepaliveGain.gain.value = 0;
    this.keepaliveOscillator = this.context.createOscillator();
    this.keepaliveOscillator.frequency.value = 20;
    this.keepaliveOscillator.connect(this.keepaliveGain);
    this.keepaliveGain.connect(this.destination);
    try {
      this.keepaliveOscillator.start();
    } catch {
      // best effort
    }
  }

  private stopKeepalive(): void {
    try {
      this.keepaliveOscillator?.stop();
    } catch {
      // best effort
    }
    try {
      this.keepaliveOscillator?.disconnect();
      this.keepaliveGain?.disconnect();
    } catch {
      // best effort
    }
    this.keepaliveOscillator = null;
    this.keepaliveGain = null;
  }

  private async applySinkId(element: HTMLMediaElement | null, deviceId?: string): Promise<boolean> {
    return applyMediaElementSinkWithDefaultFallback(element, deviceId, {
      onSelectedSinkFailure: clearStoredAudioOutputDeviceId,
      label: 'remote-audio',
    });
  }
}

function currentAudioTrack(stream: MediaStream | null): MediaStreamTrack | null {
  const tracks = stream?.getAudioTracks() ?? [];
  return tracks.find((track) => track.readyState !== 'ended') ?? tracks[0] ?? null;
}

function sampleUsable(sample: VoiceRecoverySample | undefined): sample is VoiceRecoverySample {
  return !!sample && Number.isFinite(sample.bytes) && Number.isFinite(sample.emitted);
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
