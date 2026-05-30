import { Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, Signal, computed, effect, input, output, signal, viewChild } from '@angular/core';
import { addIcons } from 'ionicons';
import { cameraReverseOutline, closeOutline, volumeHighOutline } from 'ionicons/icons';
import { MicMeterComponent } from '../mic-meter/mic-meter.component';

export type DeviceDialogMode = 'lobby' | 'in-call';
export type DeviceDialogPresentation = 'inline' | 'modal';

@Component({
  selector: 'app-device-dialog',
  standalone: true,
  imports: [MicMeterComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './device-dialog.component.html',
  styleUrl: './device-dialog.component.scss',
})
export class DeviceDialogComponent {
  readonly mode = input<DeviceDialogMode>('lobby');
  readonly presentation = input<DeviceDialogPresentation>('modal');
  readonly open = input(true);
  readonly permissionIntro = input(false);
  readonly stream = input<MediaStream | null>(null);
  readonly audioInputs = input<MediaDeviceInfo[]>([]);
  readonly videoInputs = input<MediaDeviceInfo[]>([]);
  readonly audioOutputs = input<MediaDeviceInfo[]>([]);
  readonly selectedAudioId = input('');
  readonly selectedVideoId = input('');
  readonly selectedAudioOutputId = input('');
  readonly level = input<Signal<number>>(signal(0).asReadonly());
  readonly canSelectAudioOutput = input(false);
  readonly canFlipCamera = input(false);
  readonly facingMode = input<'user' | 'environment'>('user');
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  // B5 — pre-call lobby self-test (R8): non-blocking flag + device name for the copy
  // (rendered only in mode==='lobby'; the in-call dialog keeps the B2 surfaces).
  readonly micTestFlagged = input(false);
  readonly micTestDeviceLabel = input('this microphone');

  readonly continuePermission = output<void>();
  readonly close = output<void>();
  readonly audioDeviceChange = output<string>();
  readonly videoDeviceChange = output<string>();
  readonly audioOutputChange = output<string>();
  readonly flipCamera = output<void>();
  readonly testSpeaker = output<void>();

  readonly levelPercent = computed(() => `${Math.round(this.level()() * 100)}%`);
  readonly levelLabel = computed(() => Math.round(this.level()() * 100));
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  constructor() {
    addIcons({ cameraReverseOutline, closeOutline, volumeHighOutline });
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

  onAudioOutputChange(event: Event): void {
    this.audioOutputChange.emit((event.target as HTMLSelectElement).value);
  }
}
