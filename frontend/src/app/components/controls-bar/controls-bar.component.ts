import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, input, output } from '@angular/core';
import { addIcons } from 'ionicons';
import {
  callOutline,
  desktopOutline,
  ellipseOutline,
  ellipse,
  micOffOutline,
  micOutline,
  peopleOutline,
  videocamOffOutline,
  videocamOutline,
} from 'ionicons/icons';
import { ViewportService } from '../../services/viewport.service';

@Component({
  selector: 'app-controls-bar',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './controls-bar.component.html',
  styleUrl: './controls-bar.component.scss',
})
export class ControlsBarComponent {
  private readonly viewport = inject(ViewportService);

  readonly roomLabel = input.required<string>();
  readonly micOn = input.required<boolean>();
  readonly cameraOn = input.required<boolean>();
  readonly screenOn = input.required<boolean>();
  readonly recording = input.required<boolean>();
  readonly uploading = input(false);
  readonly isHost = input(false);
  readonly participantCount = input(0);
  readonly waitingCount = input(0);
  readonly sidebarOpen = input(false);
  readonly mute = output<void>();
  readonly camera = output<void>();
  readonly screen = output<void>();
  readonly record = output<void>();
  readonly sidebar = output<void>();
  readonly leave = output<void>();
  readonly isMobile = this.viewport.isMobile;

  constructor() {
    addIcons({
      callOutline,
      desktopOutline,
      ellipse,
      ellipseOutline,
      micOffOutline,
      micOutline,
      peopleOutline,
      videocamOffOutline,
      videocamOutline,
    });
  }
}
