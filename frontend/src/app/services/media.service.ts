import { Injectable, Signal, inject, signal } from '@angular/core';
import { ViewportService } from './viewport.service';

export type MediaError = { code: 'denied' | 'no-devices' | 'unknown'; message: string };

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

const AUDIO_PROCESSING_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

@Injectable({ providedIn: 'root' })
export class MediaService {
  private readonly viewport = inject(ViewportService);

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

  async getLocalStream(cameraOn: boolean): Promise<MediaStream> {
    const current = this.localStream();
    if (current) return current;
    return this.preflight({ audio: true, video: cameraOn });
  }

  async preflight(constraints: PreflightOptions): Promise<MediaStream> {
    return this.acquire({
      audio: this.audioConstraints(constraints.audio, constraints.audioDeviceId),
      video: this.videoConstraints(constraints.video, {
        deviceId: constraints.videoDeviceId,
        facingMode: constraints.facingMode,
      }),
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
    const audio = this.audioConstraints(true, options.audioDeviceId);
    const video = this.videoConstraints(options.video, {
      deviceId: options.videoDeviceId,
      facingMode: options.facingMode,
    });
    return this.acquire({ audio, video });
  }

  async replaceAudioTrack(deviceId: string | undefined, onAudioTrackChanged: (track: MediaStreamTrack) => Promise<void>): Promise<MediaStreamTrack | null> {
    const stream = this.localStream();
    if (!stream) return null;
    const oldTrack = stream.getAudioTracks()[0] ?? null;
    const audio = this.audioConstraints(true, deviceId);
    const nextStream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    registerDebugTracks(nextStream);
    const nextTrack = nextStream.getAudioTracks()[0];
    if (!nextTrack) {
      nextStream.getTracks().forEach((track) => track.stop());
      return null;
    }
    stream.addTrack(nextTrack);
    await onAudioTrackChanged(nextTrack);
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
    const video = this.videoConstraints(true, { deviceId, facingMode });
    const nextStream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
    registerDebugTracks(nextStream);
    const nextTrack = nextStream.getVideoTracks()[0];
    if (!nextTrack) {
      nextStream.getTracks().forEach((track) => track.stop());
      return null;
    }
    stream.addTrack(nextTrack);
    await onVideoTrackChanged(nextTrack);
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
      this.micLevel.set(Math.min(1, Math.sqrt(sum / buffer.length) * 3));
    }, 125);
  }

  toggleMic(): boolean {
    const track = this.localStream()?.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    this.micOn.set(track.enabled);
    return track.enabled;
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
    if (!stream) return false;
    const existing = stream.getVideoTracks()[0];
    if (existing) {
      existing.enabled = !existing.enabled;
      this.cameraOn.set(existing.enabled);
      await onVideoTrackChanged(existing.enabled ? existing : null);
      return existing.enabled;
    }

    const camStream = await navigator.mediaDevices.getUserMedia({
      video: this.videoConstraints(true, options),
    });
    registerDebugTracks(camStream);
    const track = camStream.getVideoTracks()[0];
    stream.addTrack(track);
    this.cameraOn.set(true);
    await onVideoTrackChanged(track);
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

    const camStream = await navigator.mediaDevices.getUserMedia({
      video: this.videoConstraints(true, { deviceId: options.videoDeviceId, facingMode: options.facingMode }),
    });
    registerDebugTracks(camStream);
    const track = camStream.getVideoTracks()[0];
    stream.addTrack(track);
    this.cameraOn.set(true);
    return true;
  }

  async toggleScreen(onVideoTrackChanged: (track: MediaStreamTrack | null) => Promise<void>): Promise<boolean> {
    if (this.screenTrack) {
      await this.stopScreen(onVideoTrackChanged);
      return false;
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

  private async acquire(constraints: MediaStreamConstraints): Promise<MediaStream> {
    this.stopCurrentMedia({ closeAudioContext: false });
    this.lastVideoConstraints.set(cloneConstraints(constraints));
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      registerDebugTracks(stream);
      this.localStream.set(stream);
      this.micOn.set(stream.getAudioTracks()[0]?.enabled ?? false);
      this.cameraOn.set(stream.getVideoTracks().length > 0);
      return stream;
    } catch (err) {
      throw normalizeMediaError(err);
    }
  }

  private stopMicLevel(): void {
    if (this.micInterval) clearInterval(this.micInterval);
    this.micInterval = null;
    this.micSource?.disconnect();
    this.micSource = null;
    this.micLevel.set(0);
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
    if (!audio) return false;
    return {
      ...AUDIO_PROCESSING_CONSTRAINTS,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    };
  }

  private videoConstraints(
    video: boolean,
    options: { deviceId?: string; facingMode?: 'user' | 'environment' } = {},
  ): boolean | MediaTrackConstraints {
    if (!video) return false;
    const target = options.deviceId ? { deviceId: { exact: options.deviceId } } : options.facingMode ? { facingMode: options.facingMode } : {};
    if (this.viewport.isMobile()) {
      return {
        width: { ideal: 854, max: 854 },
        height: { ideal: 480, max: 480 },
        ...target,
      };
    }
    return { width: { ideal: 1280 }, height: { ideal: 720 }, ...target };
  }
}

function cloneConstraints(constraints: MediaStreamConstraints): MediaStreamConstraints {
  return JSON.parse(JSON.stringify(constraints)) as MediaStreamConstraints;
}

function normalizeMediaError(err: unknown): MediaError {
  const value = err as { name?: string; message?: string };
  if (value?.name === 'NotAllowedError' || value?.name === 'PermissionDeniedError') {
    return { code: 'denied', message: 'Media permission denied' };
  }
  if (value?.name === 'NotFoundError' || value?.name === 'DevicesNotFoundError') {
    return { code: 'no-devices', message: 'No devices found' };
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
