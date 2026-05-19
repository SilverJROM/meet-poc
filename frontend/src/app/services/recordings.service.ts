import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type Recording = {
  filename: string;
  sizeBytes: number;
  roomId: string;
  roomTitle: string;
  uploadedAtIso: string;
};

@Injectable({ providedIn: 'root' })
export class RecordingsService {
  private readonly http = inject(HttpClient);

  async list(): Promise<Recording[]> {
    const res = await firstValueFrom(this.http.get<{ recordings: Recording[] }>('/api/recordings'));
    return res.recordings;
  }

  downloadUrl(recording: Recording): string {
    return `/api/recordings/${encodeURIComponent(recording.filename)}/download`;
  }
}
