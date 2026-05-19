import { Injectable, inject, signal } from '@angular/core';
import { PlatformService } from './platform.service';

type RecordingResponse = {
  ok: true;
  file: string;
  bytes: number;
};

@Injectable({ providedIn: 'root' })
export class RecorderService {
  private readonly platform = inject(PlatformService);

  readonly isRecording = signal(false);
  readonly isUploading = signal(false);
  readonly lastUpload = signal<RecordingResponse | null>(null);
  readonly lastRecordingMime = signal<string | null>(null);
  readonly lastRecordingExtension = signal<string>('webm');
  readonly lastRecorderTimeslice = signal<number | null>(null);
  readonly sourceCount = signal(0);

  private ctx: AudioContext | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private sourceFor = new Map<string, MediaStreamAudioSourceNode>();
  private mimeType = 'audio/webm;codecs=opus';
  private extension = 'webm';

  start(localStream: MediaStream, peerStreams: Map<string, MediaStream>): void {
    if (this.isRecording()) return;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtor();
    const dest = ctx.createMediaStreamDestination();
    this.ctx = ctx;
    this.dest = dest;
    this.sourceFor = new Map();
    this.sourceCount.set(0);
    this.chunks = [];
    this.lastUpload.set(null);

    this.addStream('local', localStream);
    for (const [clientId, stream] of peerStreams) {
      this.addStream(clientId, stream);
    }

    const selected = this.pickMime();
    this.mimeType = selected.mimeType || 'audio/webm';
    this.extension = selected.extension;
    this.lastRecordingMime.set(selected.mimeType || null);
    this.lastRecordingExtension.set(selected.extension);
    this.recorder = new MediaRecorder(dest.stream, selected.mimeType ? { mimeType: selected.mimeType } : undefined);
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    if (this.platform.isIOS()) {
      this.lastRecorderTimeslice.set(null);
      this.recorder.start();
    } else {
      this.lastRecorderTimeslice.set(1000);
      this.recorder.start(1000);
    }
    this.isRecording.set(true);
  }

  addPeerStream(clientId: string, stream: MediaStream | null): void {
    if (!stream || !this.isRecording()) return;
    this.addStream(clientId, stream);
  }

  removePeerStream(clientId: string): void {
    const source = this.sourceFor.get(clientId);
    if (!source) return;
    try {
      source.disconnect();
    } catch {
      // Disconnect can throw if the node is already gone during cleanup.
    }
    this.sourceFor.delete(clientId);
    this.sourceCount.set(this.sourceFor.size);
  }

  async stop(): Promise<Blob> {
    const recorder = this.recorder;
    if (!recorder || recorder.state === 'inactive') return new Blob([], { type: this.mimeType });
    const stopped = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mimeType });
        this.cleanupAudioGraph();
        this.isRecording.set(false);
        resolve(blob);
      };
    });
    recorder.stop();
    return stopped;
  }

  async upload(blob: Blob, roomId: string): Promise<RecordingResponse> {
    this.isUploading.set(true);
    try {
      const res = await fetch('/upload', {
        method: 'POST',
        headers: {
          'Content-Type': blob.type || 'audio/webm',
          'X-Ext': this.extension,
          'X-Room': roomId,
        },
        body: blob,
      });
      if (!res.ok) throw new Error(`upload failed ${res.status}`);
      const json = (await res.json()) as RecordingResponse;
      this.lastUpload.set(json);
      return json;
    } finally {
      this.isUploading.set(false);
    }
  }

  discard(): void {
    if (this.recorder?.state === 'recording') {
      this.recorder.stop();
    }
    this.cleanupAudioGraph();
    this.isRecording.set(false);
    this.isUploading.set(false);
  }

  private addStream(clientId: string, stream: MediaStream): void {
    if (!this.ctx || !this.dest || this.sourceFor.has(clientId) || stream.getAudioTracks().length === 0) return;
    try {
      const source = this.ctx.createMediaStreamSource(stream);
      source.connect(this.dest);
      this.sourceFor.set(clientId, source);
      this.sourceCount.set(this.sourceFor.size);
    } catch (err) {
      console.warn('recording mix source failed', err);
    }
  }

  private cleanupAudioGraph(): void {
    for (const source of this.sourceFor.values()) {
      try {
        source.disconnect();
      } catch {
        // best effort
      }
    }
    this.sourceFor.clear();
    this.sourceCount.set(0);
    this.chunks = [];
    this.recorder = null;
    this.dest = null;
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }
  }

  private pickMime(): { mimeType: string; extension: string } {
    const candidates = [
      { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
      { mimeType: 'audio/webm', extension: 'webm' },
      { mimeType: 'audio/mp4;codecs=mp4a.40.2', extension: 'mp4' },
      { mimeType: 'audio/mp4', extension: 'mp4' },
      { mimeType: 'audio/aac', extension: 'aac' },
    ];
    for (const candidate of candidates) {
      if (MediaRecorder.isTypeSupported(candidate.mimeType)) return candidate;
    }
    return { mimeType: '', extension: 'webm' };
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
