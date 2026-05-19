import { Component, CUSTOM_ELEMENTS_SCHEMA, input, output } from '@angular/core';
import { addIcons } from 'ionicons';
import {
  callOutline,
  desktopOutline,
  ellipseOutline,
  ellipse,
  micOffOutline,
  micOutline,
  videocamOffOutline,
  videocamOutline,
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
  readonly micOn = input.required<boolean>();
  readonly cameraOn = input.required<boolean>();
  readonly screenOn = input.required<boolean>();
  readonly recording = input.required<boolean>();
  readonly uploading = input(false);
  readonly isHost = input(false);
  readonly mute = output<void>();
  readonly camera = output<void>();
  readonly screen = output<void>();
  readonly record = output<void>();
  readonly leave = output<void>();

  constructor() {
    addIcons({
      callOutline,
      desktopOutline,
      ellipse,
      ellipseOutline,
      micOffOutline,
      micOutline,
      videocamOffOutline,
      videocamOutline,
    });
  }
}
