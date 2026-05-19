import { DatePipe } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { PaginationComponent } from '../../components/pagination/pagination.component';
import { Recording, RecordingsService } from '../../services/recordings.service';

const DEFAULT_PAGE_SIZE = 20;

@Component({
  selector: 'app-recordings-page',
  standalone: true,
  imports: [DatePipe, PaginationComponent],
  templateUrl: './recordings.page.html',
  styleUrl: './recordings.page.scss',
})
export class RecordingsPage implements OnDestroy {
  readonly recordingsService = inject(RecordingsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly querySub: Subscription;

  readonly recordings = signal<Recording[]>([]);
  readonly page = signal(1);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly total = signal(0);
  readonly sessionId = signal<string | null>(null);
  readonly loading = signal(true);
  readonly hasRecordings = computed(() => this.recordings().length > 0);

  constructor() {
    this.querySub = this.route.queryParamMap.subscribe((params) => {
      this.page.set(readPositiveInt(params.get('page'), 1));
      this.pageSize.set(Math.min(readPositiveInt(params.get('pageSize'), DEFAULT_PAGE_SIZE), 100));
      this.sessionId.set(params.get('session'));
      void this.refreshRecordings();
    });
  }

  ngOnDestroy(): void {
    this.querySub.unsubscribe();
  }

  async refreshRecordings(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.recordingsService.list({
        page: this.page(),
        pageSize: this.pageSize(),
        sessionId: this.sessionId(),
      });
      this.recordings.set(result.recordings);
      this.total.set(result.total);
    } catch {
      this.recordings.set([]);
      this.total.set(0);
    } finally {
      this.loading.set(false);
    }
  }

  recordingSize(recording: Recording): string {
    return `${Math.round(recording.sizeBytes / 1024)} KB`;
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
