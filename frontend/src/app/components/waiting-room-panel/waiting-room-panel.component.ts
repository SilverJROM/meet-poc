import { Component, input, output } from '@angular/core';

export type Knocker = {
  id: string;
  name: string;
};

@Component({
  selector: 'app-waiting-room-panel',
  standalone: true,
  templateUrl: './waiting-room-panel.component.html',
  styleUrl: './waiting-room-panel.component.scss',
})
export class WaitingRoomPanelComponent {
  readonly knockers = input.required<Knocker[]>();
  readonly admit = output<string>();
  readonly reject = output<string>();
}
