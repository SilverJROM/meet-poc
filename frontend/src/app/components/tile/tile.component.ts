import { Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, computed, effect, input, output, viewChild } from '@angular/core';
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
  readonly remoteAudioBlocked = output<void>();
  readonly initials = computed(() => toInitials(this.peer().name));
  readonly videoStream = computed(() => this.displayStream() ?? this.peer().stream);
  readonly showVideo = computed(() => this.forceVideo() || (!this.peer().screenOn && this.peer().camEnabled && !!this.videoStream()?.getVideoTracks()?.length));
  readonly isMirroredSelfView = computed(() => this.peer().isLocal && this.showVideo() && !this.displayStream() && this.variant() !== 'share-main');
  readonly avatarColor = computed(() => {
    const name = this.peer().name || 'x';
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
    const hue = hash % 360;
    return `linear-gradient(135deg, hsl(${hue}, 48%, 24%), hsl(${(hue + 34) % 360}, 42%, 34%))`;
  });
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private readonly remoteAudio = viewChild<ElementRef<HTMLAudioElement>>('remoteAudio');

  constructor() {
    addIcons({ micOffOutline });
    effect(() => {
      const video = this.video()?.nativeElement;
      if (video) {
        video.muted = true;
        video.srcObject = this.videoStream();
      }
    });
    effect(() => {
      const audio = this.remoteAudio()?.nativeElement;
      const stream = this.peer().isLocal ? null : this.peer().stream;
      if (!audio) return;
      if (audio.srcObject !== stream) audio.srcObject = stream;
      audio.muted = false;
      if (!stream) return;
      void audio.play().catch((err) => {
        console.debug('[media] remote audio autoplay blocked', err);
        this.remoteAudioBlocked.emit();
      });
    });
  }
}
