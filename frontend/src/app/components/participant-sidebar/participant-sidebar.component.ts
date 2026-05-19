import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, input, output, signal } from '@angular/core';
import { addIcons } from 'ionicons';
import { ellipsisVerticalOutline, micOffOutline, micOutline, videocamOffOutline, videocamOutline } from 'ionicons/icons';
import { ViewportService } from '../../services/viewport.service';
import { PeerState } from '../../services/webrtc.service';

export type Knocker = {
  id: string;
  name: string;
};

@Component({
  selector: 'app-participant-sidebar',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './participant-sidebar.component.html',
  styleUrl: './participant-sidebar.component.scss',
})
export class ParticipantSidebarComponent {
  private readonly viewport = inject(ViewportService);

  readonly open = input(false);
  readonly peers = input.required<PeerState[]>();
  readonly knockers = input.required<Knocker[]>();
  readonly isHost = input(false);
  readonly myClientId = input<string | null>(null);
  readonly mute = output<string>();
  readonly remove = output<string>();
  readonly admit = output<string>();
  readonly reject = output<string>();
  readonly close = output<void>();
  readonly menuFor = signal<string | null>(null);
  readonly activeSection = signal<'participants' | 'waiting'>('participants');
  readonly admittedCount = computed(() => this.peers().length);
  readonly isMobile = this.viewport.isMobile;
  private touchStartY: number | null = null;

  constructor() {
    addIcons({ ellipsisVerticalOutline, micOffOutline, micOutline, videocamOffOutline, videocamOutline });
  }

  initial(name: string): string {
    return (name.trim().slice(0, 1) || '?').toUpperCase();
  }

  avatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
    return `hsl(${hash % 360}, 45%, 30%)`;
  }

  canManage(peer: PeerState): boolean {
    return this.isHost() && peer.id !== this.myClientId();
  }

  toggleMenu(peerId: string): void {
    this.menuFor.set(this.menuFor() === peerId ? null : peerId);
  }

  mutePeer(peerId: string): void {
    this.menuFor.set(null);
    this.mute.emit(peerId);
  }

  removePeer(peerId: string): void {
    this.menuFor.set(null);
    this.remove.emit(peerId);
  }

  setSection(section: 'participants' | 'waiting'): void {
    if (section === 'waiting' && !this.isHost()) return;
    this.activeSection.set(section);
  }

  onTouchStart(event: TouchEvent): void {
    this.touchStartY = event.touches[0]?.clientY ?? null;
  }

  onTouchMove(event: TouchEvent): void {
    if (this.touchStartY == null) return;
    const currentY = event.touches[0]?.clientY ?? this.touchStartY;
    if (currentY - this.touchStartY > 60) {
      this.touchStartY = null;
      this.close.emit();
    }
  }

  handleFocusIn(event: FocusEvent): void {
    if (!this.isMobile()) return;
    const target = event.target as HTMLElement | null;
    if (target?.matches('input, textarea, select')) this.close.emit();
  }
}
