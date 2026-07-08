import { Injectable, signal } from '@angular/core';
import { PeerState } from './peer-state';
import type { RemoteAudioPlayoutDiagnostics } from './meeting-sessions.service';

type RemotePublisherEntry = {
  stream: MediaStream;
  track: MediaStreamTrack;
  trackName: string | null;
  el: HTMLAudioElement;
  graph: RemoteAudioGraph | null;
  blocked: boolean;
  playbackFailure: 'unsupported' | 'aborted' | null;
  voiceStalled: boolean;
  sinkApplyResult: SinkApplyResult;
  sinkApplyTimedOut: boolean;
  autoGain: number;
  onEnded: () => void;
  onPlaying: () => void;
  onPaused: () => void;
  generation: number;
};

type RemoteAudioGraph = {
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
  compressor: DynamicsCompressorNode;
  destination: MediaStreamAudioDestinationNode;
};

type SinkIdTargetState = {
  desiredDeviceId: string;
  inFlight: Promise<SinkApplyResult> | null;
  rerun: boolean;
};

export type SinkApplyResult = 'selected' | 'default-fallback' | 'unsupported' | 'failed';
export type VoiceRecoveryAction = 'none' | 'resume' | 'kickstart' | 'replay' | 'rebuild';
export type VoiceRecoveryStep = Exclude<VoiceRecoveryAction, 'none'>;

export type VoiceRecoverySample = {
  bytes: number;
  emitted: number;
  audioLevel?: number | null;
  totalAudioEnergy?: number | null;
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
  registryPeerIds: string[];
  registryTrackIds: string[];
  blockedPeerIds: string[];
  unlocked: boolean;
  voiceRecoveryCounters: Record<VoiceRecoveryStep, number>;
  autoGains: Record<string, number>;
};

const VOLUME_STORAGE_KEY = 'meet-poc:volume:value';
export const AUDIO_OUTPUT_DEVICE_STORAGE_KEY = 'meet-poc.device.audioOutput';
const DEFAULT_VOLUME = 1;
export const MAX_VOLUME = 1;
const SINK_ID_TIMEOUT_MS = 2_000;
export const VOICE_RECOVERY_SAMPLE_WINDOW = 4;
export const VOICE_RECOVERY_MAX_ATTEMPTS_PER_WINDOW = 4;
export const VOICE_RECOVERY_MIN_BYTES_DELTA = 0;
export const VOICE_RECOVERY_MAX_EMITTED_DELTA = 0;
export const VOICE_RECOVERY_MIN_AUDIO_LEVEL = 0.0005;
export const VOICE_RECOVERY_MIN_TOTAL_AUDIO_ENERGY_DELTA = 0.000001;
const AUTO_LEVEL_TARGET_RATIO = 0.88;
const AUTO_LEVEL_NOISE_FLOOR = 0.003;
const AUTO_LEVEL_MAX_GAIN = 2.5;
const AUTO_LEVEL_SMOOTHING = 0.35;

export type RemoteAudioLevelSample = {
  publisherClientId: string;
  audioLevel: number | null;
};

export function computeRemoteAutoGains(
  samples: RemoteAudioLevelSample[],
  previous: Record<string, number> = {},
): Record<string, number> {
  const usable = samples.filter(
    (sample): sample is { publisherClientId: string; audioLevel: number } =>
      !!sample.publisherClientId &&
      typeof sample.audioLevel === 'number' &&
      Number.isFinite(sample.audioLevel) &&
      sample.audioLevel >= AUTO_LEVEL_NOISE_FLOOR,
  );
  const loudest = usable.reduce((max, sample) => Math.max(max, sample.audioLevel), 0);
  const next: Record<string, number> = {};
  for (const sample of samples) {
    const prev = previous[sample.publisherClientId] ?? 1;
    let raw = 1;
    if (
      loudest > 0 &&
      typeof sample.audioLevel === 'number' &&
      Number.isFinite(sample.audioLevel) &&
      sample.audioLevel >= AUTO_LEVEL_NOISE_FLOOR
    ) {
      raw = Math.max(1, Math.min(AUTO_LEVEL_MAX_GAIN, (loudest * AUTO_LEVEL_TARGET_RATIO) / sample.audioLevel));
    }
    next[sample.publisherClientId] = Number((prev + (raw - prev) * AUTO_LEVEL_SMOOTHING).toFixed(3));
  }
  return next;
}

export function decideVoiceRecovery(input: VoiceRecoveryDecisionInput): VoiceRecoveryAction {
  if (input.mutedAll) return 'none';
  if (input.attemptsThisWindow >= VOICE_RECOVERY_MAX_ATTEMPTS_PER_WINDOW) return 'none';
  if (!sampleWindowHasBytesArrivingEmissionStall(input.samples) && !sampleWindowHasZeroLevelNullEnergyReceiving(input.samples)) return 'none';
  if (sampleWindowHasInvalidVoiceEnergy(input.samples)) return 'none';
  if (sampleWindowHasMeasuredSilence(input.samples)) return 'none';

  if (input.attemptsThisWindow === 0) return 'resume';
  if (input.attemptsThisWindow === 1) return 'kickstart';
  if (input.attemptsThisWindow === 2) return 'replay';
  return 'rebuild';
}

export function voiceRecoveryWindowExhaustedWhileStalled(input: VoiceRecoveryDecisionInput): boolean {
  if (input.mutedAll || input.attemptsThisWindow < VOICE_RECOVERY_MAX_ATTEMPTS_PER_WINDOW) return false;
  if (!sampleWindowHasBytesArrivingEmissionStall(input.samples) && !sampleWindowHasZeroLevelNullEnergyReceiving(input.samples)) return false;
  if (sampleWindowHasInvalidVoiceEnergy(input.samples)) return false;
  return !sampleWindowHasMeasuredSilence(input.samples);
}

export function sampleWindowHasVoiceEnergy(samples: VoiceRecoverySample[]): boolean {
  let highestAudioLevel = 0;
  const finiteEnergySamples: number[] = [];
  for (const sample of samples) {
    const level = sample.audioLevel;
    if (typeof level === 'number' && Number.isFinite(level) && level >= 0) {
      highestAudioLevel = Math.max(highestAudioLevel, level);
    }
    const energy = sample.totalAudioEnergy;
    if (typeof energy === 'number' && Number.isFinite(energy) && energy >= 0) {
      finiteEnergySamples.push(energy);
    }
  }
  if (highestAudioLevel > VOICE_RECOVERY_MIN_AUDIO_LEVEL) return true;
  if (finiteEnergySamples.length < 2) return false;
  return finiteEnergySamples[finiteEnergySamples.length - 1] - finiteEnergySamples[0] > VOICE_RECOVERY_MIN_TOTAL_AUDIO_ENERGY_DELTA;
}

function sampleWindowHasBytesArrivingEmissionStall(samples: VoiceRecoverySample[]): boolean {
  if (samples.length < VOICE_RECOVERY_SAMPLE_WINDOW) return false;
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!sampleUsable(first) || !sampleUsable(last)) return false;
  return (
    last.bytes - first.bytes > VOICE_RECOVERY_MIN_BYTES_DELTA &&
    last.emitted - first.emitted <= VOICE_RECOVERY_MAX_EMITTED_DELTA
  );
}

function sampleWindowHasZeroLevelNullEnergyReceiving(samples: VoiceRecoverySample[]): boolean {
  if (samples.length < VOICE_RECOVERY_SAMPLE_WINDOW) return false;
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!sampleUsable(first) || !sampleUsable(last)) return false;
  if (last.bytes - first.bytes <= VOICE_RECOVERY_MIN_BYTES_DELTA) return false;
  return samples.every((sample) => sample.audioLevel === 0 && sample.totalAudioEnergy === null);
}

function sampleWindowHasInvalidVoiceEnergy(samples: VoiceRecoverySample[]): boolean {
  return samples.some((sample) => {
    const level = sample.audioLevel;
    if (typeof level === 'number' && (!Number.isFinite(level) || level < 0)) return true;
    const energy = sample.totalAudioEnergy;
    return typeof energy === 'number' && (!Number.isFinite(energy) || energy < 0);
  });
}

function sampleWindowHasMeasuredSilence(samples: VoiceRecoverySample[]): boolean {
  const finitePositiveLevels: number[] = [];
  const finitePositiveEnergySamples: number[] = [];
  for (const sample of samples) {
    const level = sample.audioLevel;
    if (typeof level === 'number' && Number.isFinite(level) && level > 0) {
      finitePositiveLevels.push(level);
    }
    const energy = sample.totalAudioEnergy;
    if (typeof energy === 'number' && Number.isFinite(energy) && energy > 0) {
      finitePositiveEnergySamples.push(energy);
    }
  }
  const hasMeasuredLowLevel =
    finitePositiveLevels.length === samples.length &&
    finitePositiveLevels.every((level) => level <= VOICE_RECOVERY_MIN_AUDIO_LEVEL);
  if (!hasMeasuredLowLevel || finitePositiveEnergySamples.length < 2) return false;
  return (
    finitePositiveEnergySamples[finitePositiveEnergySamples.length - 1] - finitePositiveEnergySamples[0] <=
    VOICE_RECOVERY_MIN_TOTAL_AUDIO_ENERGY_DELTA
  );
}

export type ApplySinkIdOptions = {
  onSelectedSinkFailure?: (deviceId: string, err: unknown) => void;
  label?: string;
};

export async function applyMediaElementSinkWithDefaultFallback(
  element: HTMLMediaElement | null,
  deviceId: string | undefined,
  options: ApplySinkIdOptions = {},
): Promise<SinkApplyResult> {
  if (!element || deviceId === undefined) return 'selected';
  const withSink = element as HTMLMediaElement & { setSinkId?: (sinkId: string) => Promise<void> };
  if (!withSink.setSinkId) return deviceId ? 'unsupported' : 'selected';

  try {
    await withSink.setSinkId(deviceId);
    return 'selected';
  } catch (err) {
    console.debug('[media] audio output sink routing failed; falling back to default speaker', {
      deviceId,
      label: options.label,
      err,
    });
    if (deviceId) options.onSelectedSinkFailure?.(deviceId, err);
    if (deviceId === '') return 'failed';
    try {
      await withSink.setSinkId('');
      return 'default-fallback';
    } catch (fallbackErr) {
      console.debug('[media] default audio output sink fallback failed', { label: options.label, fallbackErr });
    }
    return 'failed';
  }
}

export function clearStoredAudioOutputDeviceId(): void {
  try {
    window.localStorage.removeItem(AUDIO_OUTPUT_DEVICE_STORAGE_KEY);
  } catch {
    // Best effort only.
  }
}

export class LatestSinkIdApplier {
  private readonly targets = new WeakMap<HTMLMediaElement, SinkIdTargetState>();

  apply(element: HTMLMediaElement | null, deviceId: string | undefined, options: ApplySinkIdOptions = {}): Promise<SinkApplyResult> {
    if (!element || deviceId === undefined) return applyMediaElementSinkWithDefaultFallback(element, deviceId, options);
    let state = this.targets.get(element);
    if (!state) {
      state = { desiredDeviceId: deviceId, inFlight: null, rerun: false };
      this.targets.set(element, state);
    }
    state.desiredDeviceId = deviceId;
    if (state.inFlight) {
      state.rerun = true;
      return state.inFlight;
    }

    state.inFlight = this.drain(element, state, options);
    return state.inFlight;
  }

  private async drain(element: HTMLMediaElement, state: SinkIdTargetState, options: ApplySinkIdOptions): Promise<SinkApplyResult> {
    try {
      let applied: SinkApplyResult = 'selected';
      while (true) {
        state.rerun = false;
        const deviceId = state.desiredDeviceId;
        applied = await applyMediaElementSinkWithDefaultFallback(element, deviceId, options);
        if (!state.rerun || state.desiredDeviceId === deviceId) return applied;
      }
    } finally {
      state.inFlight = null;
      state.rerun = false;
    }
  }
}

@Injectable({ providedIn: 'root' })
export class RemoteAudioService {
  readonly contextState = signal<AudioContextState | 'none'>('none');
  readonly mutedAll = signal(false);
  readonly volume = signal(DEFAULT_VOLUME);
  // Bumped whenever registry playout state changes, so reactive consumers re-check
  // the unblock banner without scanning the DOM.
  readonly sourcesVersion = signal(0);
  // Kept for debug compatibility; true only when every registered remote element is playing.
  readonly outputPlaying = signal(false);
  readonly remoteAudioBlocked = signal(false);

  private readonly registry = new Map<string, RemotePublisherEntry>();
  private readonly sinkIdApplier = new LatestSinkIdApplier();
  private selectedSinkId: string | undefined;
  private effectiveSinkId: string | null = null;
  private usedDefaultSinkFallback = false;
  private audioContext: AudioContext | null = null;
  private unlocked = false;
  private inCall = false;
  private generation = 0;
  private readonly voiceRecoveryCounters: Record<VoiceRecoveryStep, number> = {
    resume: 0,
    kickstart: 0,
    replay: 0,
    rebuild: 0,
  };

  constructor() {
    this.setVolume(readStoredVolume(), true);
  }

  mixerEnabled(): boolean {
    return true;
  }

  setMutedAll(value: boolean): void {
    this.mutedAll.set(value);
    if (value) {
      for (const entry of this.registry.values()) entry.voiceStalled = false;
    }
    for (const entry of this.registry.values()) this.applyVolumeState(entry.el, entry);
    this.refreshBlockedState();
  }

  setVolume(value: number, forcePersist = false): void {
    const clamped = Math.max(0, Math.min(MAX_VOLUME, Number.isFinite(value) ? value : DEFAULT_VOLUME));
    this.volume.set(clamped);
    if (forcePersist || clamped !== value) persistVolume(clamped);
    else persistVolume(clamped);
    for (const entry of this.registry.values()) this.applyVolumeState(entry.el, entry);
    this.refreshBlockedState();
  }

  updateAutoLevels(samples: RemoteAudioLevelSample[]): void {
    const previous = Object.fromEntries([...this.registry.entries()].map(([id, entry]) => [id, entry.autoGain]));
    const next = computeRemoteAutoGains(samples, previous);
    for (const [id, entry] of this.registry) {
      entry.autoGain = next[id] ?? 1;
      this.applyVolumeState(entry.el, entry);
    }
  }

  syncPeers(peers: PeerState[], remoteTrackNames: Map<string, Map<string, string>> = new Map()): void {
    if (!this.inCall) {
      this.clearRegistry();
      return;
    }
    const remoteAudioPeers = peers
      .filter((peer) => !peer.isLocal)
      .map((peer) => ({ id: peer.id, stream: peer.stream, track: currentAudioTrack(peer.stream) }))
      .filter((peer): peer is { id: string; stream: MediaStream; track: MediaStreamTrack } => !!peer.stream && !!peer.track);
    const nextIds = new Set(remoteAudioPeers.map((peer) => peer.id));

    for (const id of [...this.registry.keys()]) {
      if (!nextIds.has(id)) this.removePublisher(id);
    }

    for (const peer of remoteAudioPeers) {
      const current = this.registry.get(peer.id);
      const trackName = remoteTrackNames.get(peer.id)?.get(peer.track.id) ?? null;
      if (current?.stream === peer.stream && current.track === peer.track) {
        if (current.trackName !== trackName) current.trackName = trackName;
        continue;
      }
      void this.addPublisher(peer.id, peer.stream, peer.track, trackName);
    }
  }

  async unlockAndPlayRemoteSinks(deviceId?: string): Promise<boolean> {
    this.selectedSinkId = deviceId;
    this.unlocked = true;
    await this.replayRegistryElements(deviceId, 'gesture');
    return this.allSinksPlaying();
  }

  async applyOutputDevice(deviceId: string): Promise<SinkApplyResult> {
    this.selectedSinkId = deviceId;
    const generation = this.generation;
    const results = await Promise.all(
      [...this.registry.entries()].map(async ([id, entry]) => {
        const sinkApplied = await this.applySinkId(entry.el, deviceId);
        if (!this.isEntryCurrent(id, entry)) return null;
        entry.sinkApplyResult = sinkApplied;
        entry.sinkApplyTimedOut = false;
        if (sinkApplied === 'failed') {
          entry.blocked = true;
        } else if (!entry.el.paused || entry.playbackFailure) {
          entry.blocked = false;
        }
        return sinkApplied;
      }),
    );
    const currentResults = results.filter((result): result is SinkApplyResult => result !== null);
    if (!this.inCall || this.generation !== generation) return combineSinkApplyResults(currentResults);
    this.updateSinkFallbackState(deviceId, currentResults);
    this.refreshBlockedState();
    return combineSinkApplyResults(currentResults);
  }

  async recoverPlayback(deviceId?: string): Promise<boolean> {
    this.selectedSinkId = deviceId;
    await this.replayRegistryElements(deviceId, 'recovery');
    return this.allSinksPlaying();
  }

  async recoverVoicePlayout(peerId: string, step: VoiceRecoveryStep, deviceId?: string): Promise<void> {
    this.voiceRecoveryCounters[step] += 1;
    this.setVoiceStalled(peerId, true);
    console.debug('[media] remote voice watchdog remediation', { peerId, step, count: this.voiceRecoveryCounters[step] });
    await this.replayRegistryElements(deviceId, `voice-${step}`, peerId);
  }

  noteVoiceEmissionAdvanced(peerId: string): void {
    this.setVoiceStalled(peerId, false);
  }

  clearVoiceStalls(peerIds?: Iterable<string>): void {
    if (!peerIds) {
      for (const id of this.registry.keys()) this.setVoiceStalled(id, false);
      return;
    }
    for (const id of peerIds) this.setVoiceStalled(id, false);
  }

  markVoiceStalled(peerId: string): void {
    this.setVoiceStalled(peerId, true);
  }

  hasSources(): boolean {
    return this.registry.size > 0;
  }

  allSinksPlaying(): boolean {
    return this.registry.size === 0 || [...this.registry.values()].every((entry) => remoteAudioBlockingReason(entry) === null);
  }

  /**
   * Test-only: drive the live AudioContext into 'suspended' so an e2e can model the
   * autoplay-blocked / suspended-with-sources reality (BUG-1 negative path). Guarded
   * to localhost at the call site (room.page.ts debug object). No-op if no context.
   */
  async suspendForTest(): Promise<void> {
    this.contextState.set('none');
  }

  /**
   * Test-only: mount a synthetic remote stream into the registry without depending
   * on a flaky cross-context WebRTC peer connection in headless CI.
   */
  injectRemoteSourceForTest(id: string, stream: MediaStream): void {
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    this.setInCallActive(true);
    void this.addPublisher(id, stream, track);
  }

  removeRemoteSourceForTest(id: string): void {
    this.removePublisher(id);
  }

  debugSnapshot(): RemoteAudioDebugSnapshot {
    const registryEntries = [...this.registry.entries()];
    return {
      mixerEnabled: this.mixerEnabled(),
      contextState: this.audioContext?.state ?? 'none',
      outputAttached: registryEntries.length > 0,
      outputPaused: registryEntries.some(([, entry]) => entry.el.paused),
      mutedAll: this.mutedAll(),
      volume: this.volume(),
      mixedPeerIds: registryEntries.map(([id]) => id),
      mixedTrackIds: registryEntries.map(([, entry]) => entry.track.id),
      kickstartCount: 0,
      kickstartPlayingCount: 0,
      registryPeerIds: registryEntries.map(([id]) => id),
      registryTrackIds: registryEntries.map(([, entry]) => entry.track.id),
      blockedPeerIds: registryEntries.filter(([, entry]) => remoteAudioBlockingReason(entry) !== null).map(([id]) => id),
      unlocked: this.unlocked,
      voiceRecoveryCounters: { ...this.voiceRecoveryCounters },
      autoGains: Object.fromEntries(registryEntries.map(([id, entry]) => [id, entry.autoGain])),
    };
  }

  playoutDiagnostics(): RemoteAudioPlayoutDiagnostics {
    const registryEntries = [...this.registry.entries()];
    return {
      selectedAudioOutputId: this.selectedSinkId ?? null,
      effectiveSinkId: this.effectiveSinkId,
      usedFallback: this.usedDefaultSinkFallback,
      unlocked: this.unlocked,
      blockedPeerIds: registryEntries.filter(([, entry]) => remoteAudioBlockingReason(entry) !== null).map(([id]) => id),
      perPublisher: registryEntries.map(([publisherClientId, entry]) => {
        const withSink = entry.el as HTMLAudioElement & { sinkId?: string };
        return {
          publisherClientId,
          trackName: entry.trackName,
          trackId: entry.track.id ?? null,
          paused: entry.el.paused,
          muted: entry.el.muted,
          volume: entry.el.volume,
          sinkId: withSink.sinkId ?? null,
          blockedReason: remoteAudioBlockingReason(entry),
          sinkApplyResult: entry.sinkApplyResult,
          sinkApplyTimedOut: entry.sinkApplyTimedOut,
          srcObjectAttached: entry.el.srcObject !== null,
          readyState: entry.track.readyState ?? null,
        };
      }),
    };
  }

  setInCallActive(active: boolean): void {
    if (this.inCall === active) return;
    this.inCall = active;
    this.generation += 1;
    if (!active) this.clearRegistry();
  }

  reset(): void {
    this.inCall = false;
    this.generation += 1;
    this.clearRegistry();
    this.unlocked = false;
    this.selectedSinkId = undefined;
    this.effectiveSinkId = null;
    this.usedDefaultSinkFallback = false;
    const context = this.audioContext;
    this.audioContext = null;
    void context?.close().catch(() => undefined);
    this.mutedAll.set(false);
    this.contextState.set('none');
    this.outputPlaying.set(false);
    this.remoteAudioBlocked.set(false);
    this.voiceRecoveryCounters.resume = 0;
    this.voiceRecoveryCounters.kickstart = 0;
    this.voiceRecoveryCounters.replay = 0;
    this.voiceRecoveryCounters.rebuild = 0;
  }

  async addPublisher(id: string, stream: MediaStream, track = currentAudioTrack(stream), trackName: string | null = null): Promise<void> {
    if (!this.inCall || !track || track.readyState === 'ended') return;
    this.removePublisher(id);
    const generation = this.generation;
    const graph = this.createRemoteAudioGraph(stream);
    const el = document.createElement('audio');
    el.dataset['remoteAudio'] = id;
    el.setAttribute('playsinline', '');
    el.style.display = 'none';
    el.setAttribute('aria-hidden', 'true');
    el.srcObject = graph?.destination.stream ?? stream;
    this.applyVolumeState(el);

    const onEnded = () => this.removePublisher(id);
    const onPlaying = () => {
      const entry = this.registry.get(id);
      if (!entry || entry.el !== el) return;
      entry.blocked = false;
      entry.playbackFailure = null;
      this.refreshBlockedState();
    };
    const onPaused = () => {
      const entry = this.registry.get(id);
      if (!entry || entry.el !== el) return;
      entry.blocked = true;
      this.refreshBlockedState();
    };
    track.addEventListener('ended', onEnded, { once: true });
    el.addEventListener('playing', onPlaying);
    el.addEventListener('play', onPlaying);
    el.addEventListener('pause', onPaused);
    el.addEventListener('ended', onPaused);
    el.addEventListener('error', onPaused);

    const entry: RemotePublisherEntry = {
      stream,
      track,
      trackName,
      el,
      graph,
      blocked: true,
      playbackFailure: null,
      voiceStalled: false,
      sinkApplyResult: 'selected',
      sinkApplyTimedOut: false,
      autoGain: 1,
      onEnded,
      onPlaying,
      onPaused,
      generation,
    };
    this.registry.set(id, entry);
    this.applyVolumeState(el, entry);
    document.body.append(el);
    this.refreshBlockedState();

    const sinkApplied = await withTimeout(this.applySinkId(el, this.selectedSinkId), SINK_ID_TIMEOUT_MS);
    if (!this.isEntryCurrent(id, entry)) {
      this.destroyRegistryElement(entry);
      return;
    }
    if (sinkApplied === 'timeout') {
      entry.sinkApplyResult = 'failed';
      entry.sinkApplyTimedOut = true;
      entry.blocked = true;
      console.debug('[media] remote audio sink routing timed out; playing through current/default output', { id });
    } else {
      entry.sinkApplyResult = sinkApplied;
      entry.sinkApplyTimedOut = false;
      if (sinkApplied === 'failed') {
        entry.blocked = true;
        this.refreshBlockedState();
      } else {
        this.updateSinkFallbackState(this.selectedSinkId, [sinkApplied]);
      }
    }

    try {
      await el.play();
      if (!this.isEntryCurrent(id, entry)) {
        this.destroyRegistryElement(entry);
        return;
      }
      entry.blocked = false;
      entry.playbackFailure = null;
    } catch (err) {
      if (!this.isEntryCurrent(id, entry)) {
        this.destroyRegistryElement(entry);
        return;
      }
      const playbackFailure = classifyPlaybackFailure(err);
      entry.playbackFailure = playbackFailure;
      entry.blocked = playbackFailure === null;
      console.debug('[media] remote audio registry play rejected', { id, unlocked: this.unlocked, err });
    }
    this.refreshBlockedState();
  }

  removePublisher(id: string): void {
    const entry = this.registry.get(id);
    if (!entry) return;
    this.registry.delete(id);
    this.destroyRegistryElement(entry);
    this.refreshBlockedState();
  }

  clearRegistry(): void {
    for (const id of [...this.registry.keys()]) this.removePublisher(id);
    this.registry.clear();
    this.refreshBlockedState();
  }

  private async applySinkId(element: HTMLMediaElement | null, deviceId?: string): Promise<SinkApplyResult> {
    return this.sinkIdApplier.apply(element, deviceId, {
      label: 'remote-audio',
    });
  }

  private updateSinkFallbackState(deviceId: string | undefined, results: SinkApplyResult[]): void {
    const combined = combineSinkApplyResults(results);
    if (combined === 'failed') return;
    const usedFallback = combined === 'default-fallback' || combined === 'unsupported';
    this.usedDefaultSinkFallback = usedFallback;
    this.effectiveSinkId = usedFallback ? '' : (deviceId ?? null);
  }

  private applyVolumeState(el: HTMLAudioElement, entry?: RemotePublisherEntry): void {
    const level = this.mutedAll() ? 0 : this.volume() * (entry?.autoGain ?? 1);
    if (entry?.graph) {
      entry.graph.gain.gain.value = Math.max(0, Math.min(level, AUTO_LEVEL_MAX_GAIN));
      el.volume = MAX_VOLUME;
      el.muted = this.mutedAll();
      return;
    }
    el.volume = Math.min(level, MAX_VOLUME);
    el.muted = this.mutedAll();
  }

  private async replayRegistryElements(deviceId: string | undefined, reason: string, peerId?: string): Promise<void> {
    const entries = [...this.registry.entries()].filter(([id]) => !peerId || id === peerId);
    await Promise.all(
      entries.map(async ([id, entry]) => {
        this.applyVolumeState(entry.el, entry);
        await this.resumeAudioContext();
        const sinkApplied = await this.applySinkId(entry.el, deviceId);
        if (!this.isEntryCurrent(id, entry)) return;
        entry.sinkApplyResult = sinkApplied;
        entry.sinkApplyTimedOut = false;
        if (sinkApplied === 'failed') {
          entry.blocked = true;
          this.refreshBlockedState();
        } else {
          if (!entry.el.paused || entry.playbackFailure) entry.blocked = false;
          this.updateSinkFallbackState(deviceId, [sinkApplied]);
        }
        try {
          await entry.el.play();
          if (!this.isEntryCurrent(id, entry)) return;
          entry.blocked = false;
          entry.playbackFailure = null;
        } catch (err) {
          if (!this.isEntryCurrent(id, entry)) return;
          const playbackFailure = classifyPlaybackFailure(err);
          entry.playbackFailure = playbackFailure;
          entry.blocked = playbackFailure === null;
          console.debug('[media] remote audio registry replay rejected', { id, reason, err });
        }
        this.refreshBlockedState();
      }),
    );
  }

  private isEntryCurrent(id: string, entry: RemotePublisherEntry): boolean {
    return this.inCall && entry.generation === this.generation && this.registry.get(id) === entry;
  }

  private createRemoteAudioGraph(stream: MediaStream): RemoteAudioGraph | null {
    const context = this.ensureAudioContext();
    if (!context) return null;
    try {
      const source = context.createMediaStreamSource(stream);
      const gain = context.createGain();
      const compressor = context.createDynamicsCompressor();
      const destination = context.createMediaStreamDestination();
      compressor.threshold.value = -18;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      source.connect(gain);
      gain.connect(compressor);
      compressor.connect(destination);
      return { source, gain, compressor, destination };
    } catch (err) {
      console.debug('[media] remote audio WebAudio graph unavailable; using direct media element', err);
      return null;
    }
  }

  private ensureAudioContext(): AudioContext | null {
    if (this.audioContext) return this.audioContext;
    const audioWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext ?? audioWindow.webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.audioContext = new Ctor();
      this.contextState.set(this.audioContext.state);
      this.audioContext.onstatechange = () => this.contextState.set(this.audioContext?.state ?? 'none');
      return this.audioContext;
    } catch (err) {
      console.debug('[media] remote audio AudioContext unavailable', err);
      return null;
    }
  }

  private async resumeAudioContext(): Promise<void> {
    const context = this.audioContext;
    if (!context || context.state !== 'suspended') return;
    try {
      await context.resume();
    } finally {
      this.contextState.set(context.state);
    }
  }

  private destroyRemoteAudioGraph(graph: RemoteAudioGraph | null): void {
    if (!graph) return;
    try { graph.source.disconnect(); } catch {}
    try { graph.gain.disconnect(); } catch {}
    try { graph.compressor.disconnect(); } catch {}
  }

  private destroyRegistryElement(entry: RemotePublisherEntry): void {
    entry.track.removeEventListener('ended', entry.onEnded);
    entry.el.removeEventListener('playing', entry.onPlaying);
    entry.el.removeEventListener('play', entry.onPlaying);
    entry.el.removeEventListener('pause', entry.onPaused);
    entry.el.removeEventListener('ended', entry.onPaused);
    entry.el.removeEventListener('error', entry.onPaused);
    try {
      entry.el.pause();
    } catch {
      // best effort
    }
    entry.el.srcObject = null;
    this.destroyRemoteAudioGraph(entry.graph);
    entry.el.remove();
  }

  private refreshBlockedState(): void {
    const entries = [...this.registry.values()];
    const blocked = entries.length > 0 && entries.some((entry) => remoteAudioBlockingReason(entry) !== null);
    const playing = entries.length > 0 && entries.every((entry) => remoteAudioBlockingReason(entry) === null);
    const changed = this.remoteAudioBlocked() !== blocked || this.outputPlaying() !== playing;
    this.remoteAudioBlocked.set(blocked);
    this.outputPlaying.set(playing);
    if (changed) this.sourcesVersion.update((v) => v + 1);
  }

  private setVoiceStalled(peerId: string, stalled: boolean): void {
    const entry = this.registry.get(peerId);
    if (!entry || entry.voiceStalled === stalled) return;
    entry.voiceStalled = stalled;
    this.refreshBlockedState();
  }
}

function remoteAudioBlockingReason(entry: RemotePublisherEntry): RemoteAudioPlayoutDiagnostics['perPublisher'][number]['blockedReason'] {
  if (entry.sinkApplyTimedOut || entry.sinkApplyResult === 'failed') return 'sink-failed';
  if (entry.voiceStalled) return 'voice-stalled';
  if (entry.playbackFailure) return null;
  if (entry.el.paused) return entry.blocked ? 'autoplay' : 'paused';
  return null;
}

export function currentAudioTrack(stream: MediaStream | null): MediaStreamTrack | null {
  const tracks = stream?.getAudioTracks() ?? [];
  return tracks.find((track) => track.readyState !== 'ended') ?? null;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | 'timeout'> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<T | 'timeout'>([
      promise,
      new Promise<'timeout'>((resolve) => {
        timeoutId = setTimeout(() => resolve('timeout'), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function combineSinkApplyResults(results: SinkApplyResult[]): SinkApplyResult {
  if (results.some((result) => result === 'failed')) return 'failed';
  if (results.some((result) => result === 'default-fallback')) return 'default-fallback';
  if (results.some((result) => result === 'unsupported')) return 'unsupported';
  return 'selected';
}

function sampleUsable(sample: VoiceRecoverySample | undefined): sample is VoiceRecoverySample {
  return !!sample && Number.isFinite(sample.bytes) && sample.bytes >= 0 && Number.isFinite(sample.emitted) && sample.emitted >= 0;
}

function classifyPlaybackFailure(err: unknown): 'unsupported' | 'aborted' | null {
  const name = typeof (err as { name?: unknown } | null)?.name === 'string' ? (err as { name: string }).name : '';
  if (name === 'NotSupportedError') return 'unsupported';
  if (name === 'AbortError') return 'aborted';
  return null;
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
