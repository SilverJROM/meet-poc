import { Component, OnDestroy, computed, input, signal } from '@angular/core';

@Component({
  selector: 'app-recording-banner',
  standalone: true,
  templateUrl: './recording-banner.component.html',
  styleUrl: './recording-banner.component.scss',
})
export class RecordingBannerComponent implements OnDestroy {
  readonly recording = input.required<boolean>();
  readonly startedAt = input<number | null>(null);
  private readonly tick = signal(0);
  private readonly interval = setInterval(() => this.tick.update((value) => value + 1), 1000);

  readonly formatted = computed(() => {
    this.tick();
    const start = this.startedAt();
    if (!start) return '0:00';
    const elapsed = Math.max(0, Math.floor((Date.now() - start) / 1000));
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
  });

  ngOnDestroy(): void {
    clearInterval(this.interval);
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
