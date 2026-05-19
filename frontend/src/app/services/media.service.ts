import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class MediaService {
  readonly localStream = signal<MediaStream | null>(null);
  readonly micOn = signal(true);
  readonly cameraOn = signal(false);
  readonly screenOn = signal(false);
  readonly screenShareAttempts = signal(0);

  private screenTrack: MediaStreamTrack | null = null;

  async getLocalStream(cameraOn: boolean): Promise<MediaStream> {
    this.stopLocal();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: cameraOn ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    });
    this.localStream.set(stream);
    this.micOn.set(stream.getAudioTracks()[0]?.enabled ?? false);
    this.cameraOn.set(stream.getVideoTracks().length > 0);
    return stream;
  }

  toggleMic(): boolean {
    const track = this.localStream()?.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    this.micOn.set(track.enabled);
    return track.enabled;
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
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
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
}
