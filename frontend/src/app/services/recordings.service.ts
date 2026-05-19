import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type Recording = {
  filename: string;
  sizeBytes: number;
  sessionId: string | null;
  roomId: string;
  roomTitle: string;
  uploadedAtIso: string;
  hasMetadata: boolean;
  speakerCount: number | null;
  durationMs: number | null;
  hasTranscript: boolean;
  transcribeStatus: 'ready' | 'pending' | 'failed' | null;
};

export type PaginatedRecordings = {
  recordings: Recording[];
  page: number;
  pageSize: number;
  total: number;
};

export type TranscriptLine = {
  startMs: number;
  endMs: number;
  clientId: string | null;
  name: string;
  text: string;
  confidence: number;
};

export type TranscriptWord = TranscriptLine & {
  text: string;
};

export type Transcript = {
  schemaVersion: number;
  transcribedAtIso?: string;
  audioFile: string;
  language: string | null;
  languageProbability?: number;
  model?: string;
  lines: TranscriptLine[];
  words: TranscriptWord[];
};

@Injectable({ providedIn: 'root' })
export class RecordingsService {
  private readonly http = inject(HttpClient);

  async list(options: { page: number; pageSize: number; sessionId?: string | null }): Promise<PaginatedRecordings> {
    const res = await firstValueFrom(
      this.http.get<PaginatedRecordings>('/api/recordings', {
        params: {
          page: String(options.page),
          pageSize: String(options.pageSize),
          ...(options.sessionId ? { session: options.sessionId } : {}),
        },
      }),
    );
    return res;
  }

  downloadUrl(recording: Recording): string {
    return `/api/recordings/${encodeURIComponent(recording.filename)}/download`;
  }

  async delete(filename: string): Promise<void> {
    await firstValueFrom(this.http.delete<{ ok: true }>(`/api/recordings/${encodeURIComponent(filename)}`));
  }

  async bulkDelete(filenames: string[]): Promise<{ deleted: number; requested: number }> {
    const res = await firstValueFrom(
      this.http.post<{ ok: true; deleted: number; requested: number }>('/api/recordings/bulk-delete', { filenames }),
    );
    return { deleted: res.deleted, requested: res.requested };
  }

  async getTranscript(filename: string): Promise<Transcript> {
    return firstValueFrom(this.http.get<Transcript>(`/api/recordings/${encodeURIComponent(filename)}/transcript`));
  }

  async transcribe(filename: string, force = false): Promise<void> {
    await firstValueFrom(
      this.http.post<{ ok: true; status: 'started' }>(`/api/recordings/${encodeURIComponent(filename)}/transcribe`, { force }),
    );
  }
}
