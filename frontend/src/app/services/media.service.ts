import { Injectable, Signal, inject, signal } from '@angular/core';
import { ViewportService } from './viewport.service';
import { accumulateEnergyFrame, audioCaptureConstraints, unappliedAudioProcessing, type AudioProcessingSettings, type EnergySample } from './mic-energy';
import {
  acquireAudio,
  acquireVideo,
  createMediaAcquisitionQueue,
} from './media-acquisition';
import { resolveMediaToggleAction } from './media-toggle';

// B5 — bounded ~3s rolling capture window for the lobby self-test. ~24 samples
// at the 125ms startMicLevel interval ≈ 3s — long enough for classifyMicCapture
// to prove flat-vs-rising energy off the SAME single AnalyserNode.
const MIC_CAPTURE_WINDOW_CAP = 24;

export type MediaError = { code: 'denied' | 'no-devices' | 'in-use' | 'unknown'; message: string };

export class ScreenShareUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScreenShareUnsupportedError';
  }
}

type DeviceLists = {
  audioInputs: MediaDeviceInfo[];
  audioOutputs: MediaDeviceInfo[];
  videoInputs: MediaDeviceInfo[];
};

type ReacquireOptions = {
  audioDeviceId?: string;
  videoDeviceId?: string;
  facingMode?: 'user' | 'environment';
  video: boolean;
};

type PreflightOptions = {
  audio: boolean;
  video: boolean;
  audioDeviceId?: string;
  videoDeviceId?: string;
  facingMode?: 'user' | 'environment';
};

@Injectable({ providedIn: 'root' })
export class MediaService {
  private readonly viewport = inject(ViewportService);
  private readonly acquisitionQueue = createMediaAcquisitionQueue((constraints) => navigator.mediaDevices.getUserMedia(constraints));

  readonly localStream = signal<MediaStream | null>(null);
  readonly screenStream = signal<MediaStream | null>(null);
  readonly micOn = signal(true);
  readonly cameraOn = signal(false);
  readonly screenOn = signal(false);
  readonly screenShareAttempts = signal(0);
  readonly lastVideoConstraints = signal<MediaStreamConstraints | null>(null);
  readonly audioContextActivated = signal(false);

  private screenTrack: MediaStreamTrack | null = null;
  private audioContext: AudioContext | null = null;
  private micInterval: ReturnType<typeof setInterval> | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micLevel = signal(0);
  // B5 — cumulative capture energy + bounded rolling EnergySample window for the
  // lobby self-test, accumulated off the SAME single AnalyserNode as micLevel.
  // Reset on stopMicLevel so a device change / leave clears stale energy.
  private micEnergyCumulative = 0;
  private micCaptureWindow: EnergySample[] = [];

  async getLocalStream(cameraOn: boolean): Promise<MediaStream> {
    const current = this.localStream();
    if (current) return current;
    return this.preflight({ audio: true, video: cameraOn });
  }

  async preflight(constraints: PreflightOptions): Promise<MediaStream> {
    const audio = constraints.audio
      ? await acquireAudio(this.acquisitionQueue, {
          deviceId: constraints.audioDeviceId,
          baseConstraints: this.audioConstraints(true) as MediaTrackConstraints,
        }).catch((err) => {
          throw normalizeMediaError(err);
        })
      : null;

    const video = constraints.video
      ? await acquireVideo(this.acquisitionQueue, {
          deviceId: constraints.videoDeviceId,
          facingMode: constraints.facingMode,
          baseConstraints: this.videoConstraints(true) as MediaTrackConstraints,
        }).catch((err) => {
          console.debug('[media] camera preflight skipped after acquisition failure', err);
          return null;
        })
      : null;

    const stream = new MediaStream([
      ...(audio ? [audio.track] : []),
      ...(video ? [video.track] : []),
    ]);
    if (constraints.audio && stream.getAudioTracks().length === 0) throw normalizeMediaError(new Error('No microphone track acquired'));
    return this.commitAcquiredLocalStream(stream, {
      audio: audio?.constraints ?? false,
      video: video?.constraints ?? false,
    });
  }

  async enumerateDevices(): Promise<DeviceLists> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      audioInputs: devices.filter((device) => device.kind === 'audioinput'),
      audioOutputs: devices.filter((device) => device.kind === 'audiooutput'),
      videoInputs: devices.filter((device) => device.kind === 'videoinput'),
    };
  }

  async reacquire(options: ReacquireOptions): Promise<MediaStream> {
    const audio = await acquireAudio(this.acquisitionQueue, {
      deviceId: options.audioDeviceId,
      baseConstraints: this.audioConstraints(true) as MediaTrackConstraints,
    }).catch((err) => {
      throw normalizeMediaError(err);
    });
    const video = options.video
      ? await acquireVideo(this.acquisitionQueue, {
          deviceId: options.videoDeviceId,
          facingMode: options.facingMode,
          baseConstraints: this.videoConstraints(true) as MediaTrackConstraints,
        }).catch((err) => {
          console.debug('[media] camera reacquire skipped after acquisition failure', err);
          return null;
        })
      : null;
    return this.commitAcquiredLocalStream(new MediaStream([
      audio.track,
      ...(video ? [video.track] : []),
    ]), {
      audio: audio.constraints,
      video: video?.constraints ?? false,
    });
  }

  async replaceAudioTrack(deviceId: string | undefined, onAudioTrackChanged: (track: MediaStreamTrack) => Promise<void>): Promise<MediaStreamTrack | null> {
    const stream = this.localStream();
    if (!stream) return null;
    const oldTrack = stream.getAudioTracks()[0] ?? null;
    const acquired = await acquireAudio(this.acquisitionQueue, {
      deviceId,
      baseConstraints: this.audioConstraints(true) as MediaTrackConstraints,
    }).catch((err) => {
      throw normalizeMediaError(err);
    });
    registerDebugTracks(acquired.stream);
    const nextTrack = acquired.track;
    this.verifyAudioProcessing(nextTrack);
    stream.addTrack(nextTrack);
    try {
      await onAudioTrackChanged(nextTrack);
    } catch (err) {
      stream.removeTrack(nextTrack);
      stopStreamTracks(acquired.stream);
      throw err;
    }
    if (oldTrack) {
      stream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    this.micOn.set(nextTrack.enabled);
    this.startMicLevel(nextTrack);
    return nextTrack;
  }

  async replaceVideoTrack(
    deviceId: string | undefined,
    onVideoTrackChanged: (track: MediaStreamTrack) => Promise<void>,
    facingMode?: 'user' | 'environment',
  ): Promise<MediaStreamTrack | null> {
    const stream = this.localStream();
    if (!stream) return null;
    const oldTrack = stream.getVideoTracks()[0] ?? null;
    const acquired = await acquireVideo(this.acquisitionQueue, {
      deviceId,
      facingMode,
      baseConstraints: this.videoConstraints(true) as MediaTrackConstraints,
    }).catch((err) => {
      throw normalizeMediaError(err);
    });
    if (!acquired) return null;
    registerDebugTracks(acquired.stream);
    const nextTrack = acquired.track;
    stream.addTrack(nextTrack);
    try {
      await onVideoTrackChanged(nextTrack);
    } catch (err) {
      stream.removeTrack(nextTrack);
      stopStreamTracks(acquired.stream);
      throw err;
    }
    if (oldTrack) {
      stream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    this.cameraOn.set(true);
    return nextTrack;
  }

  removeAudioTrack(): void {
    const stream = this.localStream();
    const track = stream?.getAudioTracks()[0] ?? null;
    if (stream && track) stream.removeTrack(track);
    if (track && track.readyState !== 'ended') track.stop();
    this.micOn.set(false);
    this.stopMicLevel();
  }

  removeVideoTrack(): void {
    const stream = this.localStream();
    const track = stream?.getVideoTracks()[0] ?? null;
    if (stream && track) stream.removeTrack(track);
    if (track && track.readyState !== 'ended') track.stop();
    this.cameraOn.set(false);
  }

  getMicLevel(stream: MediaStream): Signal<number> {
    this.stopMicLevel();
    const track = stream.getAudioTracks()[0];
    if (!track) {
      this.micLevel.set(0);
      return this.micLevel.asReadonly();
    }

    if (this.viewport.isMobile() && !this.audioContextActivated()) {
      this.micLevel.set(0);
      return this.micLevel.asReadonly();
    }

    void this.activateMicPreview(stream);
    return this.micLevel.asReadonly();
  }

  async activateMicPreview(stream: MediaStream | null = this.localStream()): Promise<boolean> {
    const track = stream?.getAudioTracks()[0];
    if (!track) {
      this.micLevel.set(0);
      return false;
    }

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    this.audioContext = this.audioContext && this.audioContext.state !== 'closed' ? this.audioContext : new AudioContextCtor();
    await this.audioContext.resume();
    this.audioContextActivated.set(true);
    this.startMicLevel(track);
    return true;
  }

  /**
   * B2 R1 — LOG-ONLY diagnostic at the audio-acquire chokepoint. Reports which of
   * EC/NS/AGC the device declined (best-effort `{ideal}` may be ignored by a device).
   * Zero behavior change: no track/constraint mutation, no control flow, no state write.
   */
  private verifyAudioProcessing(track: MediaStreamTrack): void {
    try {
      const unapplied = unappliedAudioProcessing(track.getSettings() as AudioProcessingSettings);
      if (unapplied.length) console.debug('[media] audio processing not applied by device', unapplied);
    } catch {
      /* getSettings unsupported — ignore */
    }
  }

  private startMicLevel(track: MediaStreamTrack): void {
    if (!this.audioContext || this.audioContext.state === 'closed') return;
    this.stopMicLevel();
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 512;
    this.micSource = this.audioContext.createMediaStreamSource(new MediaStream([track]));
    this.micSource.connect(analyser);
    const buffer = new Uint8Array(analyser.fftSize);

    this.micInterval = setInterval(() => {
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (const sample of buffer) {
        const centered = (sample - 128) / 128;
        sum += centered * centered;
      }
      const meanSquare = sum / buffer.length;
      // B5 — accumulate the SAME per-frame mean-square (raw RMS, NOT the ×3 display
      // value) into the cumulative running total + bounded rolling window, off this
      // SAME single analyser, so the lobby self-test classifies capture exactly like
      // the in-call watchdog. The ×3 stays display-only on micLevel below.
      const sample = accumulateEnergyFrame(this.micEnergyCumulative, meanSquare);
      this.micEnergyCumulative = sample.totalAudioEnergy as number;
      this.micCaptureWindow.push(sample);
      if (this.micCaptureWindow.length > MIC_CAPTURE_WINDOW_CAP) this.micCaptureWindow.shift();
      this.micLevel.set(Math.min(1, Math.sqrt(meanSquare) * 3));
    }, 125);
  }

  /** B5 — a COPY of the bounded rolling capture window for the lobby self-test poller. */
  getMicCaptureWindow(): EnergySample[] {
    return this.micCaptureWindow.slice();
  }

  async toggleMic(
    onAudioTrackChanged: (track: MediaStreamTrack | null) => Promise<void> = async () => {},
    options: { audioDeviceId?: string } = {},
  ): Promise<boolean> {
    const stream = this.localStream();
    const track = stream?.getAudioTracks()[0];
    const action = resolveMediaToggleAction({
      streamExists: !!stream,
      trackExists: !!track,
      trackEnabled: !!track?.enabled,
    });

    if (action !== 'acquire' && track) {
      track.enabled = action === 'enable';
      this.micOn.set(track.enabled);
      return track.enabled;
    }

    // 'acquire' — re-ask permission, getUserMedia, add + publish, mirror replaceAudioTrack.
    const acquired = await acquireAudio(this.acquisitionQueue, {
      deviceId: options.audioDeviceId,
      baseConstraints: this.audioConstraints(true) as MediaTrackConstraints,
    }).catch((err) => {
      throw normalizeMediaError(err);
    });
    registerDebugTracks(acquired.stream);
    const nextTrack = acquired.track;
    this.verifyAudioProcessing(nextTrack);
    if (!stream) {
      this.localStream.set(acquired.stream);
    } else {
      stream.addTrack(nextTrack);
    }
    try {
      await onAudioTrackChanged(nextTrack);
    } catch (err) {
      if (!stream) this.localStream.set(null);
      else stream.removeTrack(nextTrack);
      stopStreamTracks(acquired.stream);
      throw err;
    }
    this.micOn.set(nextTrack.enabled);
    this.startMicLevel(nextTrack);
    return true;
  }

  muteMic(): boolean {
    const track = this.localStream()?.getAudioTracks()[0];
    if (!track) {
      this.micOn.set(false);
      return false;
    }
    track.enabled = false;
    this.micOn.set(false);
    return false;
  }

  async toggleCamera(
    onVideoTrackChanged: (track: MediaStreamTrack | null) => Promise<void>,
    options: { videoDeviceId?: string; facingMode?: 'user' | 'environment' } = {},
  ): Promise<boolean> {
    const stream = this.localStream();
    const existing = stream?.getVideoTracks()[0];
    const action = resolveMediaToggleAction({
      streamExists: !!stream,
      trackExists: !!existing,
      trackEnabled: !!existing?.enabled,
    });

    if (action !== 'acquire' && existing) {
      existing.enabled = action === 'enable';
      this.cameraOn.set(existing.enabled);
      await onVideoTrackChanged(existing.enabled ? existing : null);
      return existing.enabled;
    }

    // 'acquire' — covers BOTH no-localStream and stream-without-video-track.
    const acquired = await acquireVideo(this.acquisitionQueue, {
      deviceId: options.videoDeviceId,
      facingMode: options.facingMode,
      baseConstraints: this.videoConstraints(true) as MediaTrackConstraints,
    }).catch((err) => {
      throw normalizeMediaError(err);
    });
    if (!acquired) return false;
    registerDebugTracks(acquired.stream);
    const track = acquired.track;
    if (!stream) {
      this.localStream.set(acquired.stream);
    } else {
      stream.addTrack(track);
    }
    try {
      await onVideoTrackChanged(track);
    } catch (err) {
      if (!stream) this.localStream.set(null);
      else stream.removeTrack(track);
      stopStreamTracks(acquired.stream);
      throw err;
    }
    this.cameraOn.set(track.enabled);
    return true;
  }

  async setCameraTrackEnabled(options: { enabled: boolean; videoDeviceId?: string; facingMode?: 'user' | 'environment' }): Promise<boolean> {
    const stream = this.localStream();
    if (!stream) return false;
    const existing = stream.getVideoTracks()[0];
    if (existing) {
      existing.enabled = options.enabled;
      this.cameraOn.set(options.enabled);
      return options.enabled;
    }
    if (!options.enabled) {
      this.cameraOn.set(false);
      return false;
    }

    const acquired = await acquireVideo(this.acquisitionQueue, {
      deviceId: options.videoDeviceId,
      facingMode: options.facingMode,
      baseConstraints: this.videoConstraints(true) as MediaTrackConstraints,
    }).catch((err) => {
      throw normalizeMediaError(err);
    });
    if (!acquired) {
      this.cameraOn.set(false);
      return false;
    }
    registerDebugTracks(acquired.stream);
    const track = acquired.track;
    stream.addTrack(track);
    this.cameraOn.set(track.enabled);
    return track.enabled;
  }

  async toggleScreen(onVideoTrackChanged: (track: MediaStreamTrack | null) => Promise<void>): Promise<boolean> {
    if (this.screenTrack) {
      await this.stopScreen(onVideoTrackChanged);
      return false;
    }
    if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function') {
      throw new ScreenShareUnsupportedError("Screen sharing isn't available in this browser. Try Chrome on Android, Safari 16+ on iPhone, or join from a desktop.");
    }
    this.screenShareAttempts.update((count) => count + 1);
    const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const track = screen.getVideoTracks()[0];
    if (track) track.contentHint = 'detail';
    registerDebugTracks(screen);
    this.screenTrack = track;
    this.screenStream.set(screen);
    this.screenOn.set(true);
    track.onended = () => {
      void this.stopScreen(onVideoTrackChanged);
    };
    await onVideoTrackChanged(track);
    return true;
  }

  async stopScreen(onVideoTrackChanged: (track: MediaStreamTrack | null) => Promise<void>): Promise<void> {
    const track = this.screenTrack;
    this.screenTrack = null;
    if (track) track.stop();
    this.screenStream.set(null);
    this.screenOn.set(false);
    await onVideoTrackChanged(this.localStream()?.getVideoTracks()[0] ?? null);
  }

  stopLocal(): void {
    this.stopCurrentMedia({ closeAudioContext: true });
  }

  private commitAcquiredLocalStream(stream: MediaStream, constraints: MediaStreamConstraints): MediaStream {
    const previous = this.localStream();
    this.lastVideoConstraints.set(cloneConstraints(constraints));
    this.stopMicLevel();
    registerDebugTracks(stream);
    this.localStream.set(stream);
    this.micOn.set(stream.getAudioTracks()[0]?.enabled ?? false);
    this.cameraOn.set(stream.getVideoTracks().length > 0);
    stopTracksNotInStream(previous, stream);
    return stream;
  }

  private stopMicLevel(): void {
    if (this.micInterval) clearInterval(this.micInterval);
    this.micInterval = null;
    this.micSource?.disconnect();
    this.micSource = null;
    this.micLevel.set(0);
    // B5 — reset cumulative energy + window so a device change / leave never bleeds
    // a stale verdict into the next device's lobby self-test.
    this.micEnergyCumulative = 0;
    this.micCaptureWindow = [];
  }

  private stopCurrentMedia(options: { closeAudioContext: boolean }): void {
    this.stopMicLevel();
    if (options.closeAudioContext) {
      if (this.audioContext && this.audioContext.state !== 'closed') void this.audioContext.close();
      this.audioContext = null;
      this.audioContextActivated.set(false);
    }
    if (this.screenTrack) {
      this.screenTrack.stop();
      this.screenTrack = null;
    }
    this.screenStream.set(null);
    this.localStream()?.getTracks().forEach((track) => track.stop());
    this.localStream.set(null);
    this.screenOn.set(false);
    this.cameraOn.set(false);
    this.micOn.set(true);
  }

  private audioConstraints(audio: boolean, deviceId?: string): boolean | MediaTrackConstraints {
    // Delegates to the framework-free pure builder (AC1): EC/NS/AGC are
    // applied-when-supported ({ideal:true}), deviceId:{exact} set only when chosen.
    return audioCaptureConstraints(audio, deviceId);
  }

  private videoConstraints(
    video: boolean,
    options: { deviceId?: string; facingMode?: 'user' | 'environment' } = {},
  ): boolean | MediaTrackConstraints {
    if (!video) return false;
    const target = options.deviceId ? { deviceId: { exact: options.deviceId } } : options.facingMode ? { facingMode: options.facingMode } : {};
    if (this.viewport.isMobile()) {
      return {
        width: { ideal: 854 },
        height: { ideal: 480 },
        ...target,
      };
    }
    return { width: { ideal: 1280 }, height: { ideal: 720 }, ...target };
  }
}

function cloneConstraints(constraints: MediaStreamConstraints): MediaStreamConstraints {
  return JSON.parse(JSON.stringify(constraints)) as MediaStreamConstraints;
}

function stopStreamTracks(stream: MediaStream): void {
  stream.getTracks().forEach((track) => {
    if (track.readyState !== 'ended') track.stop();
  });
}

function normalizeMediaError(err: unknown): MediaError {
  const value = err as { name?: string; message?: string };
  if (value?.name === 'NotAllowedError' || value?.name === 'PermissionDeniedError') {
    return { code: 'denied', message: 'Media permission denied' };
  }
  if (value?.name === 'NotFoundError' || value?.name === 'DevicesNotFoundError') {
    return { code: 'no-devices', message: 'No devices found' };
  }
  if (
    value?.name === 'NotReadableError'
    || value?.name === 'TrackStartError'
    || /in use|busy|could not start/i.test(String(value?.message || ''))
  ) {
    return { code: 'in-use', message: 'Camera or microphone is in use by another app or tab' };
  }
  return { code: 'unknown', message: String(value?.message || err) };
}

declare global {
  interface Window {
    __activeTracks?: MediaStreamTrack[];
    webkitAudioContext?: typeof AudioContext;
  }
}

function registerDebugTracks(stream: MediaStream): void {
  const tracks = stream.getTracks();
  if (tracks.length === 0) return;
  window.__activeTracks = [...(window.__activeTracks ?? []), ...tracks];
}

function stopTracksNotInStream(previous: MediaStream | null, next: MediaStream): void {
  if (!previous) return;
  const nextTracks = new Set(next.getTracks());
  previous.getTracks().forEach((track) => {
    if (!nextTracks.has(track) && track.readyState !== 'ended') track.stop();
  });
}
