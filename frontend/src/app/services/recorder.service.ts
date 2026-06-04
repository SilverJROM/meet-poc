import { Injectable, effect, inject, signal } from '@angular/core';
import { ActiveSpeakerService } from './active-speaker.service';
import { PlatformService } from './platform.service';

type RecordingResponse = {
  ok: true;
  file: string;
  bytes: number;
};

export type ParticipantSnapshot = {
  clientId: string;
  displayName: string;
  isHost: boolean;
};

type ParticipantMetadata = ParticipantSnapshot & {
  joinedAtMs: number;
  leftAtMs: number | null;
};

type SpeakerSegment = {
  startMs: number;
  endMs: number;
  clientId: string;
  source: 'active-speaker-rms';
};

type RecordingMetadata = {
  schemaVersion: 1;
  sessionId: string;
  roomId: string;
  recordingStartedAtIso: string;
  recordingDurationMs: number;
  participants: ParticipantMetadata[];
  segments: SpeakerSegment[];
};

type MetadataUploadResponse = {
  ok: true;
  metaFile: string;
  bytes: number;
};

const MIN_SEGMENT_MS = 250;

@Injectable({ providedIn: 'root' })
export class RecorderService {
  private readonly platform = inject(PlatformService);
  private readonly activeSpeaker = inject(ActiveSpeakerService);

  readonly isRecording = signal(false);
  readonly isUploading = signal(false);
  readonly lastUpload = signal<RecordingResponse | null>(null);
  readonly lastMetadataUpload = signal<MetadataUploadResponse | null>(null);
  readonly metadataWarning = signal<string | null>(null);
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
  private recordingStartedAt = 0;
  private recordingStartedAtIso = '';
  private recordingDurationMs = 0;
  private metadataContext: { sessionId: string; roomId: string } | null = null;
  private participants = new Map<string, ParticipantMetadata>();
  private segments: SpeakerSegment[] = [];
  private openSegment: SpeakerSegment | null = null;

  constructor() {
    effect(() => {
      const frame = this.activeSpeaker.activeFrame();
      if (!this.isRecording()) return;
      this.captureSpeakerFrame(frame.id, frame.at);
    });
  }

  start(
    localStream: MediaStream,
    peerStreams: Map<string, MediaStream>,
    metadata?: { sessionId: string; roomId: string; participants: ParticipantSnapshot[] },
  ): void {
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
    this.lastMetadataUpload.set(null);
    this.metadataWarning.set(null);
    this.startMetadata(metadata);

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
    this.closeOpenSegment(Date.now());
    this.recordingDurationMs = this.relativeMs(Date.now());
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
      await this.uploadMetadata(json.file);
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
    this.resetMetadata();
  }

  notifyParticipantJoined(participant: ParticipantSnapshot): void {
    if (!this.isRecording() || !this.metadataContext || this.participants.has(participant.clientId)) return;
    this.participants.set(participant.clientId, {
      ...participant,
      joinedAtMs: this.relativeMs(Date.now()),
      leftAtMs: null,
    });
  }

  setSessionId(sessionId: string | null | undefined): void {
    if (!this.metadataContext || !sessionId) return;
    this.metadataContext = { ...this.metadataContext, sessionId };
  }

  notifyParticipantLeft(clientId: string): void {
    if (!this.isRecording() || !this.metadataContext) return;
    const participant = this.participants.get(clientId);
    if (participant && participant.leftAtMs == null) {
      this.participants.set(clientId, { ...participant, leftAtMs: this.relativeMs(Date.now()) });
    }
    this.removePeerStream(clientId);
  }

  private addStream(clientId: string, stream: MediaStream): void {
    if (!this.ctx || !this.dest) return;
    if (this.sourceFor.has(clientId)) this.removePeerStream(clientId);
    if (stream.getAudioTracks().length === 0) return;
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

  private startMetadata(metadata?: { sessionId: string; roomId: string; participants: ParticipantSnapshot[] }): void {
    this.recordingStartedAt = Date.now();
    this.recordingStartedAtIso = new Date(this.recordingStartedAt).toISOString();
    this.recordingDurationMs = 0;
    this.metadataContext = metadata ? { sessionId: metadata.sessionId, roomId: metadata.roomId } : null;
    this.participants.clear();
    this.segments = [];
    this.openSegment = null;
    for (const participant of metadata?.participants || []) {
      this.participants.set(participant.clientId, { ...participant, joinedAtMs: 0, leftAtMs: null });
    }
  }

  private resetMetadata(): void {
    this.metadataContext = null;
    this.participants.clear();
    this.segments = [];
    this.openSegment = null;
    this.recordingStartedAt = 0;
    this.recordingStartedAtIso = '';
    this.recordingDurationMs = 0;
  }

  private captureSpeakerFrame(clientId: string | null, at: number): void {
    if (!this.metadataContext || !this.recordingStartedAt) return;
    const nowMs = this.relativeMs(at);
    if (!clientId) {
      this.closeOpenSegment(at);
      return;
    }
    if (!this.participants.has(clientId)) {
      this.participants.set(clientId, {
        clientId,
        displayName: clientId,
        isHost: false,
        joinedAtMs: nowMs,
        leftAtMs: null,
      });
    }
    if (!this.openSegment) {
      this.openSegment = { startMs: nowMs, endMs: nowMs, clientId, source: 'active-speaker-rms' };
      return;
    }
    if (this.openSegment.clientId === clientId) {
      this.openSegment = { ...this.openSegment, endMs: nowMs };
      return;
    }
    this.closeOpenSegment(at);
    this.openSegment = { startMs: nowMs, endMs: nowMs, clientId, source: 'active-speaker-rms' };
  }

  private closeOpenSegment(at: number): void {
    const current = this.openSegment;
    if (!current) return;
    const endMs = Math.max(current.endMs, this.relativeMs(at));
    const segment = { ...current, endMs };
    if (segment.endMs - segment.startMs >= MIN_SEGMENT_MS) this.segments.push(segment);
    this.openSegment = null;
  }

  private relativeMs(at: number): number {
    return Math.max(0, Math.round(at - this.recordingStartedAt));
  }

  private buildMetadata(): RecordingMetadata | null {
    const context = this.metadataContext;
    if (!context) return null;
    return {
      schemaVersion: 1,
      sessionId: context.sessionId,
      roomId: context.roomId,
      recordingStartedAtIso: this.recordingStartedAtIso,
      recordingDurationMs: this.recordingDurationMs,
      participants: Array.from(this.participants.values()),
      segments: this.segments,
    };
  }

  private async uploadMetadata(filename: string): Promise<void> {
    const metadata = this.buildMetadata();
    if (!metadata) return;
    try {
      const res = await fetch('/api/recordings/upload-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, metadata }),
      });
      if (!res.ok) throw new Error(`metadata upload failed ${res.status}`);
      this.lastMetadataUpload.set((await res.json()) as MetadataUploadResponse);
    } catch (err) {
      console.warn('recording metadata upload failed', err);
      this.metadataWarning.set('Recording saved, but speaker metadata was not saved.');
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
