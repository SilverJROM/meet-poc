import { Component, OnDestroy, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription, interval, startWith } from 'rxjs';
import { MeetingSession, MeetingSessionsService } from '../../services/meeting-sessions.service';

@Component({
  selector: 'app-ongoing-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './ongoing.page.html',
  styleUrl: './ongoing.page.scss',
})
export class OngoingPage implements OnDestroy {
  private readonly sessionsService = inject(MeetingSessionsService);
  private readonly pollSub: Subscription;

  readonly sessions = signal<MeetingSession[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    this.pollSub = interval(5000)
      .pipe(startWith(0))
      .subscribe(() => {
        void this.refresh();
      });
  }

  ngOnDestroy(): void {
    this.pollSub.unsubscribe();
  }

  async refresh(): Promise<void> {
    this.error.set(null);
    try {
      const result = await this.sessionsService.listActive();
      this.sessions.set(result.sessions);
    } catch {
      this.error.set('Ongoing meetings could not be loaded');
    } finally {
      this.loading.set(false);
    }
  }

  startedAgo(session: MeetingSession): string {
    const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(session.startedAtIso)) / 60000));
    if (minutes < 1) return 'Started just now';
    if (minutes === 1) return 'Started 1 minute ago';
    return `Started ${minutes} minutes ago`;
  }

  participantsLabel(session: MeetingSession): string {
    const count = session.admittedPeak;
    return `${count} ${count === 1 ? 'participant' : 'participants'}`;
  }
}
