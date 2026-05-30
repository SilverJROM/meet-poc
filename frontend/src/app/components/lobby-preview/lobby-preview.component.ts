import { Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, Signal, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { addIcons } from 'ionicons';
import { cameraReverseOutline } from 'ionicons/icons';
import { ViewportService } from '../../services/viewport.service';
import { BackgroundPickerComponent } from '../background-picker/background-picker.component';
import { MicMeterComponent } from '../mic-meter/mic-meter.component';

@Component({
  selector: 'app-lobby-preview',
  standalone: true,
  imports: [BackgroundPickerComponent, MicMeterComponent],
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
  // B5 — pre-call lobby self-test (R8): non-blocking flag + the device name for the copy.
  readonly micTestFlagged = input(false);
  readonly micTestDeviceLabel = input('this microphone');

  readonly audioDeviceChange = output<string>();
  readonly videoDeviceChange = output<string>();
  readonly enableMicPreview = output<void>();
  readonly flipCamera = output<void>();
  readonly isMobile = this.viewport.isMobile;

  readonly backgroundPickerOpen = signal(false);

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  toggleBackgroundPicker(): void {
    this.backgroundPickerOpen.update((open) => !open);
  }

  constructor() {
    addIcons({ cameraReverseOutline });
    effect(() => {
      const video = this.video()?.nativeElement;
      const stream = this.stream();
      if (video) video.srcObject = stream;
    });
  }

  onAudioChange(event: Event): void {
    this.audioDeviceChange.emit((event.target as HTMLSelectElement).value);
  }

  onVideoChange(event: Event): void {
    this.videoDeviceChange.emit((event.target as HTMLSelectElement).value);
  }
}
