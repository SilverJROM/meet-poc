import { Component, CUSTOM_ELEMENTS_SCHEMA, input, output } from '@angular/core';
import { addIcons } from 'ionicons';
import {
  chatboxOutline,
  callOutline,
  chevronUpOutline,
  desktopOutline,
  ellipseOutline,
  ellipse,
  informationCircleOutline,
  micOffOutline,
  micOutline,
  peopleOutline,
  pulseOutline,
  settingsOutline,
  videocamOffOutline,
  videocamOutline,
  volumeHighOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-controls-bar',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './controls-bar.component.html',
  styleUrl: './controls-bar.component.scss',
})
export class ControlsBarComponent {
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
  readonly diagnosticsOpen = input(false);
  readonly audioOnly = input(false);
  readonly mute = output<void>();
  readonly camera = output<void>();
  readonly screen = output<void>();
  readonly record = output<void>();
  readonly sidebar = output<void>();
  readonly diagnostics = output<void>();
  readonly audioOnlyToggle = output<void>();
  readonly devices = output<void>();
  readonly leave = output<void>();

  constructor() {
    addIcons({
      chatboxOutline,
      callOutline,
      chevronUpOutline,
      desktopOutline,
      ellipse,
      ellipseOutline,
      informationCircleOutline,
      micOffOutline,
      micOutline,
      peopleOutline,
      pulseOutline,
      settingsOutline,
      videocamOffOutline,
      videocamOutline,
      volumeHighOutline,
    });
  }
}
