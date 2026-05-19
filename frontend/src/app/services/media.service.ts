import { Injectable, Signal, inject, signal } from '@angular/core';
import { ViewportService } from './viewport.service';

export type MediaError = { code: 'denied' | 'no-devices' | 'unknown'; message: string };

type DeviceLists = {
  audioInputs: MediaDeviceInfo[];
  videoInputs: MediaDeviceInfo[];
};

type ReacquireOptions = {
  audioDeviceId?: string;
  videoDeviceId?: string;
  video: boolean;
};

@Injectable({ providedIn: 'root' })
export class MediaService {
  private readonly viewport = inject(ViewportService);

  readonly localStream = signal<MediaStream | null>(null);
  readonly micOn = signal(true);
  readonly cameraOn = signal(false);
  readonly screenOn = signal(false);
  readonly screenShareAttempts = signal(0);
  readonly lastVideoConstraints = signal<MediaStreamConstraints | null>(null);

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

  async preflight(constraints: { audio: boolean; video: boolean }): Promise<MediaStream> {
    return this.acquire({
      audio: constraints.audio ? true : false,
      video: this.videoConstraints(constraints.video),
    });
  }

  async enumerateDevices(): Promise<DeviceLists> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      audioInputs: devices.filter((device) => device.kind === 'audioinput'),
      videoInputs: devices.filter((device) => device.kind === 'videoinput'),
    };
  }

  async reacquire(options: ReacquireOptions): Promise<MediaStream> {
    const audio = options.audioDeviceId ? { deviceId: { exact: options.audioDeviceId } } : true;
    const baseVideo = this.videoConstraints(true) as MediaTrackConstraints;
    const video = options.video
      ? {
          ...baseVideo,
          ...(options.videoDeviceId ? { deviceId: { exact: options.videoDeviceId } } : {}),
        }
      : false;
    return this.acquire({ audio, video });
  }

  getMicLevel(stream: MediaStream): Signal<number> {
    this.stopMicLevel();
    const track = stream.getAudioTracks()[0];
    if (!track) {
      this.micLevel.set(0);
      return this.micLevel.asReadonly();
    }

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    this.audioContext = this.audioContext && this.audioContext.state !== 'closed' ? this.audioContext : new AudioContextCtor();
    void this.audioContext.resume();
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
    return this.micLevel.asReadonly();
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

  async toggleCamera(onVideoTrackChanged: (track: MediaStreamTrack | null) => Promise<void>): Promise<boolean> {
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
      video: this.videoConstraints(true),
    });
    const track = camStream.getVideoTracks()[0];
    stream.addTrack(track);
    this.cameraOn.set(true);
    await onVideoTrackChanged(track);
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
    this.screenTrack = track;
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
    this.screenOn.set(false);
    await onVideoTrackChanged(this.localStream()?.getVideoTracks()[0] ?? null);
  }

  stopLocal(): void {
    this.stopMicLevel();
    if (this.audioContext && this.audioContext.state !== 'closed') void this.audioContext.close();
    this.audioContext = null;
    if (this.screenTrack) {
      this.screenTrack.stop();
      this.screenTrack = null;
    }
    this.localStream()?.getTracks().forEach((track) => track.stop());
    this.localStream.set(null);
    this.screenOn.set(false);
    this.cameraOn.set(false);
    this.micOn.set(true);
  }

  private async acquire(constraints: MediaStreamConstraints): Promise<MediaStream> {
    this.stopLocal();
    this.lastVideoConstraints.set(cloneConstraints(constraints));
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
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

  private videoConstraints(video: boolean): boolean | MediaTrackConstraints {
    if (!video) return false;
    if (this.viewport.isMobile()) {
      return {
        width: { ideal: 854, max: 854 },
        height: { ideal: 480, max: 480 },
      };
    }
    return { width: { ideal: 1280 }, height: { ideal: 720 } };
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
    webkitAudioContext?: typeof AudioContext;
  }
}
