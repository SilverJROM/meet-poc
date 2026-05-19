import { Component, ElementRef, input, viewChild, effect } from '@angular/core';
import { PeerState } from '../../services/webrtc.service';

@Component({
  selector: 'app-tile',
  standalone: true,
  templateUrl: './tile.component.html',
  styleUrl: './tile.component.scss',
})
export class TileComponent {
  readonly peer = input.required<PeerState>();
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  constructor() {
    effect(() => {
      const video = this.video()?.nativeElement;
      if (video) video.srcObject = this.peer().stream;
    });
  }
}
