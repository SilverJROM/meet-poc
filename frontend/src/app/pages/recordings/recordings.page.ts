import { DatePipe } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { addIcons } from 'ionicons';
import { trashOutline } from 'ionicons/icons';
import { PaginationComponent } from '../../components/pagination/pagination.component';
import { reconcilePendingRecordings } from '../../services/recording-pending';
import { Recording, RecordingsService } from '../../services/recordings.service';

const DEFAULT_PAGE_SIZE = 20;

@Component({
  selector: 'app-recordings-page',
  standalone: true,
  imports: [DatePipe, PaginationComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
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
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly status = signal<string | null>(null);
  readonly hasRecordings = computed(() => this.recordings().length > 0);
  readonly selectedFilenames = signal<ReadonlySet<string>>(new Set());
  readonly selectedCount = computed(() => this.selectedFilenames().size);
  readonly allOnPageSelected = computed(() => {
    const recordings = this.recordings();
    if (recordings.length === 0) return false;
    const selected = this.selectedFilenames();
    return recordings.every((recording) => selected.has(recording.filename));
  });

  constructor() {
    addIcons({ trashOutline });
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
    this.error.set(null);
    try {
      const result = await this.recordingsService.list({
        page: this.page(),
        pageSize: this.pageSize(),
        sessionId: this.sessionId(),
      });
      this.recordings.set(result.recordings);
      this.total.set(result.total);
      await this.reconcilePendingRecordingMarkers();
    } catch {
      this.recordings.set([]);
      this.total.set(0);
      this.error.set('Recordings could not be loaded');
    } finally {
      this.loading.set(false);
    }
  }

  recordingSize(recording: Recording): string {
    return `${Math.round(recording.sizeBytes / 1024)} KB`;
  }

  async deleteRecording(recording: Recording): Promise<void> {
    if (!window.confirm(`Delete "${recording.filename}"? This cannot be undone.`)) return;
    this.busy.set(true);
    this.error.set(null);
    this.status.set(null);
    try {
      await this.recordingsService.delete(recording.filename);
      this.removeSelection(recording.filename);
      this.status.set('Deleted 1 recording');
      await this.refreshRecordings();
    } catch {
      this.error.set('Recording could not be deleted');
    } finally {
      this.busy.set(false);
    }
  }

  isSelected(filename: string): boolean {
    return this.selectedFilenames().has(filename);
  }

  toggleSelection(filename: string): void {
    const next = new Set(this.selectedFilenames());
    if (next.has(filename)) next.delete(filename);
    else next.add(filename);
    this.selectedFilenames.set(next);
  }

  toggleSelectAllOnPage(): void {
    const filenames = this.recordings().map((recording) => recording.filename);
    const selected = this.selectedFilenames();
    const allOn = filenames.length > 0 && filenames.every((filename) => selected.has(filename));
    const next = new Set(selected);
    if (allOn) {
      for (const filename of filenames) next.delete(filename);
    } else {
      for (const filename of filenames) next.add(filename);
    }
    this.selectedFilenames.set(next);
  }

  clearSelection(): void {
    this.selectedFilenames.set(new Set());
  }

  async bulkDeleteSelected(): Promise<void> {
    const filenames = Array.from(this.selectedFilenames());
    if (filenames.length === 0) return;
    const noun = filenames.length === 1 ? 'recording' : 'recordings';
    if (!window.confirm(`Delete ${filenames.length} ${noun}? This cannot be undone.`)) return;
    this.busy.set(true);
    this.error.set(null);
    this.status.set(null);
    try {
      const { deleted } = await this.recordingsService.bulkDelete(filenames);
      this.status.set(`Deleted ${deleted} ${deleted === 1 ? 'recording' : 'recordings'}`);
      this.clearSelection();
      await this.refreshRecordings();
    } catch {
      this.error.set('Bulk delete failed');
    } finally {
      this.busy.set(false);
    }
  }

  async goToPage(page: number): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page },
      queryParamsHandling: 'merge',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private removeSelection(filename: string): void {
    const next = new Set(this.selectedFilenames());
    next.delete(filename);
    this.selectedFilenames.set(next);
  }

  private async reconcilePendingRecordingMarkers(): Promise<void> {
    const result = await reconcilePendingRecordings(this.recordingsService);
    if (result.pendingSessionIds.length > 0) {
      this.status.set('A recording upload is still unconfirmed. Check this page again after the background upload finishes.');
    } else if (result.confirmedSessionIds.length > 0) {
      this.status.set(`Confirmed ${result.confirmedSessionIds.length} pending recording upload${result.confirmedSessionIds.length === 1 ? '' : 's'}.`);
    }
  }
}

function readPositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
}
