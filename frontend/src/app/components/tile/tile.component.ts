import { Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, computed, effect, input, viewChild } from '@angular/core';
import { addIcons } from 'ionicons';
import { micOffOutline } from 'ionicons/icons';
import { PeerState } from '../../services/webrtc.service';
import { toInitials } from '../../utils/initials';

@Component({
  selector: 'app-tile',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './tile.component.html',
  styleUrl: './tile.component.scss',
})
export class TileComponent {
  readonly peer = input.required<PeerState>();
  readonly speaking = input(false);
  readonly variant = input<'grid' | 'strip' | 'share-main'>('grid');
  readonly displayStream = input<MediaStream | null>(null);
  readonly forceVideo = input(false);
  readonly initials = computed(() => toInitials(this.peer().name));
  readonly videoStream = computed(() => this.displayStream() ?? this.peer().stream);
  readonly showVideo = computed(() => this.forceVideo() || (this.peer().camEnabled && !!this.videoStream()?.getVideoTracks()?.length));
  readonly avatarColor = computed(() => {
    const name = this.peer().name || 'x';
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
    return `hsl(${hash % 360}, 45%, 30%)`;
  });
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  constructor() {
    addIcons({ micOffOutline });
    effect(() => {
      const video = this.video()?.nativeElement;
      if (video) video.srcObject = this.videoStream();
    });
  }
}
