import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type MeetingSession = {
  id: string;
  roomId: string;
  roomTitle: string;
  hostEmail: string;
  startedAtIso: string;
  admittedPeak: number;
  endedAtIso?: string;
  endedReason?: string;
  durationMs?: number;
  recordingsCount?: number;
};

export type ActiveSessionsResponse = {
  sessions: MeetingSession[];
  total: number;
};

export type EndedSessionsResponse = {
  sessions: MeetingSession[];
  page: number;
  pageSize: number;
  total: number;
};

@Injectable({ providedIn: 'root' })
export class MeetingSessionsService {
  private readonly http = inject(HttpClient);

  async listActive(): Promise<ActiveSessionsResponse> {
    return firstValueFrom(this.http.get<ActiveSessionsResponse>('/api/meeting-sessions?status=active'));
  }

  async listEnded(options: { page: number; pageSize: number }): Promise<EndedSessionsResponse> {
    return firstValueFrom(
      this.http.get<EndedSessionsResponse>('/api/meeting-sessions', {
        params: {
          status: 'ended',
          page: String(options.page),
          pageSize: String(options.pageSize),
        },
      }),
    );
  }
}
