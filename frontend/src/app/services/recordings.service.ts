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

export type TranscriptProvider = 'local' | 'openrouter';

export type TranscriptVersion = {
  provider: TranscriptProvider;
  model: string;
  isPrimary: boolean;
};

export type TranscriptVersionsResponse = {
  filename: string;
  versions: TranscriptVersion[];
};

export type TranscribeOptions = {
  force?: boolean;
  provider?: TranscriptProvider;
  model?: string;
};

export type Transcript = {
  schemaVersion: number;
  transcribedAtIso?: string;
  audioFile: string;
  language: string | null;
  languageProbability?: number;
  provider?: TranscriptProvider;
  model?: string;
  lines: TranscriptLine[];
  words: TranscriptWord[];
};

export type NamedTranscriptLine = {
  startMs: number;
  endMs?: number;
  name: string;
  text: string;
};

export type NamedTranscript = {
  sessionId: string;
  speakers: string[];
  transcript: NamedTranscriptLine[];
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

  async getNamedTranscript(sessionId: string): Promise<NamedTranscript> {
    return firstValueFrom(
      this.http.get<NamedTranscript>(`/api/recordings/named-transcript/${encodeURIComponent(sessionId)}`),
    );
  }

  async downloadTranscriptTxt(filename: string): Promise<void> {
    const blob = await firstValueFrom(
      this.http.get(`/api/recordings/${encodeURIComponent(filename)}/transcript.txt`, {
        observe: 'response',
        responseType: 'blob',
      }),
    );
    const downloadName = transcriptDownloadName(filename);
    const url = URL.createObjectURL(blob.body ?? new Blob([], { type: 'text/plain' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = downloadName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async deleteTranscript(filename: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`/api/recordings/${encodeURIComponent(filename)}/transcript`));
  }

  async listTranscriptVersions(filename: string): Promise<TranscriptVersionsResponse> {
    return firstValueFrom(
      this.http.get<TranscriptVersionsResponse>(`/api/recordings/${encodeURIComponent(filename)}/transcript/versions`),
    );
  }

  async transcribe(filename: string, options: boolean | TranscribeOptions = false): Promise<void> {
    const body =
      typeof options === 'boolean'
        ? { force: options }
        : {
            force: options.force === true,
            ...(options.provider ? { provider: options.provider } : {}),
            ...(options.model ? { model: options.model } : {}),
          };
    await firstValueFrom(
      this.http.post<{ ok: true; status: 'started' }>(`/api/recordings/${encodeURIComponent(filename)}/transcribe`, body),
    );
  }

  async deleteTranscriptVersion(filename: string, provider: TranscriptProvider, model: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`/api/recordings/${encodeURIComponent(filename)}/transcript/versions`, {
        params: { provider, model },
      }),
    );
  }

  async setPrimaryTranscript(filename: string, provider: TranscriptProvider, model: string): Promise<void> {
    await firstValueFrom(
      this.http.put<{ ok: true; provider: TranscriptProvider; model: string }>(
        `/api/recordings/${encodeURIComponent(filename)}/transcript/primary`,
        { provider, model },
      ),
    );
  }
}

function transcriptDownloadName(filename: string): string {
  return filename.replace(/\.[^.]+$/, '') + '.txt';
}
