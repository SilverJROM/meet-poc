import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import {
  DiagnosticEntry,
  DiagnosticSessionSummary,
  DiagnosticsDetailResponse,
  MeetingSessionsService,
} from '../../services/meeting-sessions.service';

@Component({
  selector: 'app-diagnostics-page',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './diagnostics.page.html',
  styleUrl: './diagnostics.page.scss',
})
export class DiagnosticsPage {
  private readonly sessionsService = inject(MeetingSessionsService);

  readonly sessions = signal<DiagnosticSessionSummary[]>([]);
  readonly selectedSessionId = signal<string | null>(null);
  readonly detail = signal<DiagnosticsDetailResponse | null>(null);
  readonly loading = signal(true);
  readonly detailLoading = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.sessionsService.listDiagnostics({ page: 1, pageSize: 50 });
      this.sessions.set(result.sessions);
      const nextSelected = this.selectedSessionId() || result.sessions[0]?.id || null;
      this.selectedSessionId.set(nextSelected);
      if (nextSelected) await this.selectSession(nextSelected);
    } catch {
      this.error.set('Diagnostics could not be loaded');
      this.sessions.set([]);
      this.detail.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  async selectSession(sessionId: string): Promise<void> {
    this.selectedSessionId.set(sessionId);
    this.detailLoading.set(true);
    this.error.set(null);
    try {
      this.detail.set(await this.sessionsService.getDiagnostics(sessionId));
    } catch {
      this.detail.set(null);
      this.error.set('Diagnostics detail could not be loaded');
    } finally {
      this.detailLoading.set(false);
    }
  }

  downloadUrl(sessionId: string): string {
    return this.sessionsService.diagnosticsDownloadUrl(sessionId);
  }

  latestEntry(): DiagnosticEntry | null {
    const entries = this.detail()?.entries ?? [];
    return entries.length ? entries[entries.length - 1] : null;
  }

  trackSummary(entry: DiagnosticEntry, kind: 'audio' | 'video'): string {
    const peer = entry.payload.peers.find((candidate) => candidate.outboundAudio.source === 'sender' || candidate.outboundVideo.source === 'sender') ?? entry.payload.peers[0];
    const track = kind === 'audio' ? peer?.outboundAudio : peer?.outboundVideo;
    if (!track) return 'No track';
    const label = track.label || 'Unlabeled';
    const deviceId = track.deviceId || 'no deviceId';
    return `${label} (${deviceId})`;
  }

  candidateLabel(entry: DiagnosticEntry): string {
    return entry.candidateTypes.length ? entry.candidateTypes.join(', ') : 'unknown';
  }

  relayLabel(session: DiagnosticSessionSummary | DiagnosticEntry): string {
    return session.relayUsed ? 'relay used' : 'no relay seen';
  }
}
