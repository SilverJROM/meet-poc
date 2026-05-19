import { Component, OnDestroy, output, signal } from '@angular/core';

@Component({
  selector: 'app-meeting-ended-toast',
  standalone: true,
  templateUrl: './meeting-ended-toast.component.html',
  styleUrl: './meeting-ended-toast.component.scss',
})
export class MeetingEndedToastComponent implements OnDestroy {
  readonly dismiss = output<void>();
  readonly countdown = signal(5);
  private readonly interval = setInterval(() => {
    const next = this.countdown() - 1;
    this.countdown.set(next);
    if (next <= 0) this.close();
  }, 1000);

  close(): void {
    clearInterval(this.interval);
    this.dismiss.emit();
  }

  ngOnDestroy(): void {
    clearInterval(this.interval);
  }
}
