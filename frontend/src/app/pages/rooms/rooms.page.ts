import { DatePipe } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { clipboardOutline, trashOutline, videocamOutline } from 'ionicons/icons';
import { Room, RoomsService } from '../../services/rooms.service';

@Component({
  selector: 'app-rooms-page',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './rooms.page.html',
  styleUrl: './rooms.page.scss',
})
export class RoomsPage {
  private readonly roomsService = inject(RoomsService);

  readonly rooms = signal<Room[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly copyStatus = signal<string | null>(null);
  readonly newTitle = signal('');
  readonly origin = window.location.origin;
  readonly hasRooms = computed(() => this.rooms().length > 0);

  constructor() {
    addIcons({ clipboardOutline, trashOutline, videocamOutline });
    void this.refreshRooms();
  }

  shareUrl(room: Room): string {
    return `${this.origin}/room/${room.id}`;
  }

  async refreshRooms(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.rooms.set(await this.roomsService.list());
    } catch {
      this.error.set('Rooms could not be loaded');
    } finally {
      this.loading.set(false);
    }
  }

  async createRoom(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const room = await this.roomsService.create(this.newTitle());
      this.rooms.set([room, ...this.rooms()]);
      this.newTitle.set('');
    } catch {
      this.error.set('Room could not be created');
    } finally {
      this.busy.set(false);
    }
  }

  async copyLink(room: Room): Promise<void> {
    const url = this.shareUrl(room);
    try {
      await navigator.clipboard.writeText(url);
      this.copyStatus.set('Copied link');
    } catch {
      window.prompt('Copy room link', url);
      this.copyStatus.set('Link ready to copy');
    }
  }

  async deleteRoom(room: Room): Promise<void> {
    if (!window.confirm(`Delete "${room.title}"?`)) return;
    await this.roomsService.delete(room.id);
    this.rooms.set(this.rooms().filter((item) => item.id !== room.id));
  }
}
