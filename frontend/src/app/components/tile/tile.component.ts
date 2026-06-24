import { Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, computed, effect, input, viewChild } from '@angular/core';
import { addIcons } from 'ionicons';
import { micOffOutline } from 'ionicons/icons';
import { PeerState, resolveCamOffBackdropUrl } from '../../services/peer-state';
import { ReactionKind } from '../../services/ws.service';
import { toInitials } from '../../utils/initials';

type TileReaction = { id: string; kind: Exclude<ReactionKind, 'raise-hand'> };

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
  readonly variant = input<'grid' | 'strip' | 'share-main' | 'self-pip'>('grid');
  readonly displayStream = input<MediaStream | null>(null);
  readonly forceVideo = input(false);
  readonly raisedHand = input(false);
  readonly reactions = input<TileReaction[]>([]);
  readonly audioUnhealthy = input(false);
  readonly initials = computed(() => toInitials(this.peer().name));
  readonly videoStream = computed(() => this.displayStream() ?? this.peer().stream);
  readonly showVideo = computed(() => this.forceVideo() || (!this.peer().screenOn && this.peer().camEnabled && !!this.videoStream()?.getVideoTracks()?.length));
  readonly camOffBackdropUrl = computed(() => {
    const peer = this.peer();
    return resolveCamOffBackdropUrl(peer.background, peer.isLocal ? peer.backgroundImageUrl : null);
  });
  readonly isMirroredSelfView = computed(() => this.peer().isLocal && this.showVideo() && !this.displayStream() && this.variant() !== 'share-main');
  readonly avatarColor = computed(() => {
    const name = this.peer().name || 'x';
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
    const hue = hash % 360;
    return `linear-gradient(135deg, hsl(${hue}, 48%, 24%), hsl(${(hue + 34) % 360}, 42%, 34%))`;
  });
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  reactionEmoji(kind: TileReaction['kind']): string {
    if (kind === 'thumbs-up') return '👍';
    if (kind === 'clap') return '👏';
    return '❤️';
  }

  constructor() {
    addIcons({ micOffOutline });
    effect(() => {
      const video = this.video()?.nativeElement;
      if (video) {
        video.muted = true;
        video.srcObject = this.videoStream();
      }
    });
  }
}
