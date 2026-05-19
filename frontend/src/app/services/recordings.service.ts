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
};

export type PaginatedRecordings = {
  recordings: Recording[];
  page: number;
  pageSize: number;
  total: number;
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
}
