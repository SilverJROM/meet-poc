import { DatePipe } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, OnDestroy, computed, inject, signal } from '@angular/core';
import { addIcons } from 'ionicons';
import { downloadOutline, eyeOutline, playCircleOutline, refreshOutline, trashOutline } from 'ionicons/icons';
import { Recording, RecordingsService, Transcript } from '../../services/recordings.service';

@Component({
  selector: 'app-transcripts-page',
  standalone: true,
  imports: [DatePipe],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './transcripts.page.html',
  styleUrl: './transcripts.page.scss',
})
export class TranscriptsPage implements OnDestroy {
  private readonly recordingsService = inject(RecordingsService);
  private pollTimer: ReturnType<typeof window.setInterval> | null = null;

  readonly recordings = signal<Recording[]>([]);
  readonly selectedFilename = signal<string | null>(null);
  readonly selectedTranscript = signal<Transcript | null>(null);
  readonly loading = signal(true);
  readonly busyFilename = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly status = signal<string | null>(null);
  readonly hasRows = computed(() => this.recordings().length > 0);

  constructor() {
    addIcons({ downloadOutline, eyeOutline, playCircleOutline, refreshOutline, trashOutline });
    void this.refreshRecordings();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  async refreshRecordings(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.recordingsService.list({ page: 1, pageSize: 100 });
      this.recordings.set(result.recordings);
      this.updatePolling();
    } catch {
      this.recordings.set([]);
      this.error.set('Transcripts could not be loaded');
      this.stopPolling();
    } finally {
      this.loading.set(false);
    }
  }

  async viewTranscript(recording: Recording): Promise<void> {
    this.busyFilename.set(recording.filename);
    this.error.set(null);
    this.status.set(null);
    try {
      const transcript = await this.recordingsService.getTranscript(recording.filename);
      this.selectedFilename.set(recording.filename);
      this.selectedTranscript.set(transcript);
    } catch {
      this.error.set('Transcript could not be opened');
    } finally {
      this.busyFilename.set(null);
    }
  }

  async transcribe(recording: Recording): Promise<void> {
    this.busyFilename.set(recording.filename);
    this.error.set(null);
    this.status.set(null);
    try {
      await this.recordingsService.transcribe(recording.filename, recording.transcribeStatus === 'failed');
      this.status.set('Transcription started');
      await this.refreshRecordings();
    } catch {
      this.error.set('Transcription could not be started');
    } finally {
      this.busyFilename.set(null);
    }
  }

  async downloadTranscript(recording: Recording): Promise<void> {
    this.busyFilename.set(recording.filename);
    this.error.set(null);
    this.status.set(null);
    try {
      await this.recordingsService.downloadTranscriptTxt(recording.filename);
      this.status.set('Transcript download started');
    } catch {
      this.error.set('Transcript could not be downloaded');
    } finally {
      this.busyFilename.set(null);
    }
  }

  async deleteTranscript(recording: Recording): Promise<void> {
    if (!window.confirm(`Delete transcript for ${recording.roomTitle}? The recording audio will stay available.`)) return;
    this.busyFilename.set(recording.filename);
    this.error.set(null);
    this.status.set(null);
    try {
      await this.recordingsService.deleteTranscript(recording.filename);
      if (this.selectedFilename() === recording.filename) {
        this.selectedFilename.set(null);
        this.selectedTranscript.set(null);
      }
      this.status.set('Transcript deleted');
      await this.refreshRecordings();
    } catch {
      this.error.set('Transcript could not be deleted');
    } finally {
      this.busyFilename.set(null);
    }
  }

  formatDuration(durationMs: number | null): string {
    if (durationMs == null) return 'Duration unknown';
    const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  timestamp(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  speakerColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 360;
    return `hsl(${hash} 64% 42%)`;
  }

  private updatePolling(): void {
    const hasPending = this.recordings().some((recording) => recording.transcribeStatus === 'pending');
    if (hasPending && !this.pollTimer) {
      this.pollTimer = window.setInterval(() => void this.refreshRecordings(), 5000);
    } else if (!hasPending) {
      this.stopPolling();
    }
  }

  private stopPolling(): void {
    if (!this.pollTimer) return;
    window.clearInterval(this.pollTimer);
    this.pollTimer = null;
  }
}
