import { Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { addIcons } from 'ionicons';
import {
  chatboxOutline,
  callOutline,
  chevronUpOutline,
  colorWandOutline,
  desktopOutline,
  ellipseOutline,
  ellipse,
  happyOutline,
  micOffOutline,
  micOutline,
  peopleOutline,
  settingsOutline,
  videocamOffOutline,
  videocamOutline,
  volumeHighOutline,
  volumeMuteOutline,
} from 'ionicons/icons';
import { RemoteAudioService } from '../../services/remote-audio.service';
import { ReactionKind } from '../../services/ws.service';

@Component({
  selector: 'app-controls-bar',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './controls-bar.component.html',
  styleUrl: './controls-bar.component.scss',
})
export class ControlsBarComponent {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly remoteAudio = inject(RemoteAudioService);
  readonly roomLabel = input.required<string>();
  readonly elapsedLabel = input('');
  readonly micOn = input.required<boolean>();
  readonly cameraOn = input.required<boolean>();
  readonly screenOn = input.required<boolean>();
  readonly recording = input.required<boolean>();
  readonly uploading = input(false);
  readonly isHost = input(false);
  readonly participantCount = input(0);
  readonly waitingCount = input(0);
  readonly sidebarOpen = input(false);
  readonly chatOpen = input(false);
  readonly chatUnreadCount = input(0);
  readonly raiseHandOn = input(false);
  readonly equalSizeTiles = input(false);
  readonly audioOnly = input(false);
  readonly mute = output<void>();
  readonly camera = output<void>();
  readonly screen = output<void>();
  readonly record = output<void>();
  readonly sidebar = output<void>();
  readonly chat = output<void>();
  readonly reaction = output<ReactionKind>();
  readonly audioOnlyToggle = output<void>();
  readonly devices = output<void>();
  readonly backgroundEffects = output<void>();
  readonly equalSizeTilesChange = output<boolean>();
  readonly leave = output<void>();
  readonly volumePopoverOpen = signal(false);
  readonly reactionsPopoverOpen = signal(false);
  readonly settingsPopoverOpen = signal(false);
  readonly volumeLabel = computed(() => {
    const percent = Math.round(this.remoteAudio.volume() * 100);
    return percent > 100 ? `${percent}% (amp)` : `${percent}%`;
  });

  constructor() {
    addIcons({
      chatboxOutline,
      callOutline,
      chevronUpOutline,
      colorWandOutline,
      desktopOutline,
      ellipse,
      ellipseOutline,
      happyOutline,
      micOffOutline,
      micOutline,
      peopleOutline,
      settingsOutline,
      videocamOffOutline,
      videocamOutline,
      volumeHighOutline,
      volumeMuteOutline,
    });
  }

  toggleReactionsPopover(event: Event): void {
    event.stopPropagation();
    this.reactionsPopoverOpen.update((open) => !open);
    this.volumePopoverOpen.set(false);
    this.settingsPopoverOpen.set(false);
  }

  chooseReaction(kind: ReactionKind): void {
    this.reaction.emit(kind);
    if (kind !== 'raise-hand') this.reactionsPopoverOpen.set(false);
  }

  toggleSpeakerMuted(): void {
    this.remoteAudio.setMutedAll(!this.remoteAudio.mutedAll());
  }

  toggleVolumePopover(event: Event): void {
    event.stopPropagation();
    this.volumePopoverOpen.update((open) => !open);
    this.settingsPopoverOpen.set(false);
    this.reactionsPopoverOpen.set(false);
  }

  setSpeakerVolume(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    this.remoteAudio.setVolume(Number.parseFloat(inputEl.value));
  }

  toggleSettingsPopover(event: Event): void {
    event.stopPropagation();
    this.settingsPopoverOpen.update((open) => !open);
    this.volumePopoverOpen.set(false);
    this.reactionsPopoverOpen.set(false);
  }

  chooseDeviceSettings(): void {
    this.settingsPopoverOpen.set(false);
    this.devices.emit();
  }

  chooseBackgroundEffects(): void {
    this.settingsPopoverOpen.set(false);
    this.backgroundEffects.emit();
  }

  toggleEqualSizeTiles(): void {
    this.equalSizeTilesChange.emit(!this.equalSizeTiles());
  }

  @HostListener('document:click', ['$event'])
  closeVolumePopoverOnOutsideClick(event: MouseEvent): void {
    if (!this.volumePopoverOpen() && !this.reactionsPopoverOpen() && !this.settingsPopoverOpen()) return;
    if (this.elementRef.nativeElement.contains(event.target as Node)) return;
    this.volumePopoverOpen.set(false);
    this.reactionsPopoverOpen.set(false);
    this.settingsPopoverOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  closeVolumePopoverOnEscape(): void {
    this.volumePopoverOpen.set(false);
    this.reactionsPopoverOpen.set(false);
    this.settingsPopoverOpen.set(false);
  }
}
