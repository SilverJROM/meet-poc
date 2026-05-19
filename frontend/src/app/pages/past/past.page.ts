import { DatePipe } from '@angular/common';
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { PaginationComponent } from '../../components/pagination/pagination.component';
import { MeetingSession, MeetingSessionsService } from '../../services/meeting-sessions.service';

const DEFAULT_PAGE_SIZE = 20;

@Component({
  selector: 'app-past-page',
  standalone: true,
  imports: [DatePipe, RouterLink, PaginationComponent],
  templateUrl: './past.page.html',
  styleUrl: './past.page.scss',
})
export class PastPage implements OnDestroy {
  private readonly sessionsService = inject(MeetingSessionsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly querySub: Subscription;

  readonly sessions = signal<MeetingSession[]>([]);
  readonly page = signal(1);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    this.querySub = this.route.queryParamMap.subscribe((params) => {
      this.page.set(readPositiveInt(params.get('page'), 1));
      this.pageSize.set(Math.min(readPositiveInt(params.get('pageSize'), DEFAULT_PAGE_SIZE), 100));
      void this.refresh();
    });
  }

  ngOnDestroy(): void {
    this.querySub.unsubscribe();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.sessionsService.listEnded({ page: this.page(), pageSize: this.pageSize() });
      this.sessions.set(result.sessions);
      this.total.set(result.total);
    } catch {
      this.sessions.set([]);
      this.total.set(0);
      this.error.set('Past meetings could not be loaded');
    } finally {
      this.loading.set(false);
    }
  }

  duration(session: MeetingSession): string {
    const seconds = Math.max(0, Math.floor((session.durationMs || 0) / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    if (hours > 0) return `${hours}:${pad(minutes)}:${pad(remainingSeconds)}`;
    return `${minutes}:${pad(remainingSeconds)}`;
  }

  participantsLabel(session: MeetingSession): string {
    const count = session.admittedPeak;
    return `${count} ${count === 1 ? 'participant' : 'participants'}`;
  }

  async goToPage(page: number): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page },
      queryParamsHandling: 'merge',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function readPositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
