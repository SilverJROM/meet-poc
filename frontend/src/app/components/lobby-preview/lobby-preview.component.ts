import { Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, Signal, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { addIcons } from 'ionicons';
import { cameraReverseOutline } from 'ionicons/icons';
import { ViewportService } from '../../services/viewport.service';
import { MicMeterComponent } from '../mic-meter/mic-meter.component';

@Component({
  selector: 'app-lobby-preview',
  standalone: true,
  imports: [MicMeterComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './lobby-preview.component.html',
  styleUrl: './lobby-preview.component.scss',
})
export class LobbyPreviewComponent {
  private readonly viewport = inject(ViewportService);

  readonly stream = input<MediaStream | null>(null);
  readonly audioInputs = input<MediaDeviceInfo[]>([]);
  readonly videoInputs = input<MediaDeviceInfo[]>([]);
  readonly selectedAudioId = input<string>('');
  readonly selectedVideoId = input<string>('');
  readonly videoEnabled = input(false);
  readonly compact = input(false);
  readonly level = input<Signal<number>>(signal(0).asReadonly());
  readonly audioContextActivated = input(false);
  readonly facingMode = input<'user' | 'environment'>('user');

  readonly audioDeviceChange = output<string>();
  readonly videoDeviceChange = output<string>();
  readonly enableMicPreview = output<void>();
  readonly flipCamera = output<void>();
  readonly isMobile = this.viewport.isMobile;

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  constructor() {
    addIcons({ cameraReverseOutline });
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
