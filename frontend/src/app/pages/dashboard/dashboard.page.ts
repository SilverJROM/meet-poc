import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { clipboardOutline, logOutOutline, trashOutline, videocamOutline } from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { Recording, RecordingsService } from '../../services/recordings.service';
import { Room, RoomsService } from '../../services/rooms.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage {
  private readonly auth = inject(AuthService);
  readonly recordingsService = inject(RecordingsService);
  private readonly roomsService = inject(RoomsService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly rooms = signal<Room[]>([]);
  readonly recordings = signal<Recording[]>([]);
  readonly loading = signal(true);
  readonly recordingsLoading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly copyStatus = signal<string | null>(null);
  readonly newTitle = signal('');
  readonly origin = window.location.origin;
  readonly hasRooms = computed(() => this.rooms().length > 0);
  readonly hasRecordings = computed(() => this.recordings().length > 0);

  constructor() {
    addIcons({ clipboardOutline, logOutOutline, trashOutline, videocamOutline });
    void this.refreshRooms();
    void this.refreshRecordings();
  }

  shareUrl(room: Room): string {
    return `${this.origin}/room/${room.id}`;
  }

  async refreshRecordings(): Promise<void> {
    this.recordingsLoading.set(true);
    try {
      this.recordings.set(await this.recordingsService.list());
    } catch {
      this.recordings.set([]);
    } finally {
      this.recordingsLoading.set(false);
    }
  }

  recordingSize(recording: Recording): string {
    return `${Math.round(recording.sizeBytes / 1024)} KB`;
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

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
