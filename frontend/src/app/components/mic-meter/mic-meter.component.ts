import { Component, Input, Signal, signal } from '@angular/core';

@Component({
  selector: 'app-mic-meter',
  standalone: true,
  templateUrl: './mic-meter.component.html',
  styleUrl: './mic-meter.component.scss',
})
export class MicMeterComponent {
  @Input() level: Signal<number> = signal(0).asReadonly();
  readonly bars = Array.from({ length: 8 }, (_, index) => index);
}
