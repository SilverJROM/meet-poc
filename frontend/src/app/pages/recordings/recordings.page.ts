import { DatePipe } from '@angular/common';
import { Component, inject, signal, computed } from '@angular/core';
import { Recording, RecordingsService } from '../../services/recordings.service';

@Component({
  selector: 'app-recordings-page',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './recordings.page.html',
  styleUrl: './recordings.page.scss',
})
export class RecordingsPage {
  readonly recordingsService = inject(RecordingsService);

  readonly recordings = signal<Recording[]>([]);
  readonly loading = signal(true);
  readonly hasRecordings = computed(() => this.recordings().length > 0);

  constructor() {
    void this.refreshRecordings();
  }

  async refreshRecordings(): Promise<void> {
    this.loading.set(true);
    try {
      this.recordings.set(await this.recordingsService.list());
    } catch {
      this.recordings.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  recordingSize(recording: Recording): string {
    return `${Math.round(recording.sizeBytes / 1024)} KB`;
  }
}
