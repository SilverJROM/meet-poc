import { Component, ElementRef, Signal, effect, input, output, signal, viewChild } from '@angular/core';
import { MicMeterComponent } from '../mic-meter/mic-meter.component';

@Component({
  selector: 'app-lobby-preview',
  standalone: true,
  imports: [MicMeterComponent],
  templateUrl: './lobby-preview.component.html',
  styleUrl: './lobby-preview.component.scss',
})
export class LobbyPreviewComponent {
  readonly stream = input<MediaStream | null>(null);
  readonly audioInputs = input<MediaDeviceInfo[]>([]);
  readonly videoInputs = input<MediaDeviceInfo[]>([]);
  readonly selectedAudioId = input<string>('');
  readonly selectedVideoId = input<string>('');
  readonly videoEnabled = input(false);
  readonly level = input<Signal<number>>(signal(0).asReadonly());

  readonly audioDeviceChange = output<string>();
  readonly videoDeviceChange = output<string>();

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  constructor() {
    effect(() => {
      const video = this.video()?.nativeElement;
      if (video) video.srcObject = this.stream();
    });
  }

  onAudioChange(event: Event): void {
    this.audioDeviceChange.emit((event.target as HTMLSelectElement).value);
  }

  onVideoChange(event: Event): void {
    this.videoDeviceChange.emit((event.target as HTMLSelectElement).value);
  }
}
