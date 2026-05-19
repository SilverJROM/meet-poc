import { DatePipe } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { addIcons } from 'ionicons';
import { clipboardOutline, trashOutline, videocamOutline } from 'ionicons/icons';
import { PaginationComponent } from '../../components/pagination/pagination.component';
import { Room, RoomsService } from '../../services/rooms.service';

const DEFAULT_PAGE_SIZE = 20;

@Component({
  selector: 'app-rooms-page',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, PaginationComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './rooms.page.html',
  styleUrl: './rooms.page.scss',
})
export class RoomsPage implements OnDestroy {
  private readonly roomsService = inject(RoomsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly querySub: Subscription;

  readonly rooms = signal<Room[]>([]);
  readonly page = signal(1);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly copyStatus = signal<string | null>(null);
  readonly newTitle = signal('');
  readonly origin = window.location.origin;
  readonly hasRooms = computed(() => this.rooms().length > 0);

  constructor() {
    addIcons({ clipboardOutline, trashOutline, videocamOutline });
    this.querySub = this.route.queryParamMap.subscribe((params) => {
      this.page.set(readPositiveInt(params.get('page'), 1));
      this.pageSize.set(Math.min(readPositiveInt(params.get('pageSize'), DEFAULT_PAGE_SIZE), 100));
      void this.refreshRooms();
    });
  }

  ngOnDestroy(): void {
    this.querySub.unsubscribe();
  }

  shareUrl(room: Room): string {
    return `${this.origin}/room/${room.id}`;
  }

  async refreshRooms(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.roomsService.list({ page: this.page(), pageSize: this.pageSize() });
      this.rooms.set(result.rooms);
      this.total.set(result.total);
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
      await this.roomsService.create(this.newTitle());
      this.newTitle.set('');
      if (this.page() === 1) {
        await this.refreshRooms();
      } else {
        await this.goToPage(1);
      }
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
    await this.refreshRooms();
  }

  async goToPage(page: number): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page },
      queryParamsHandling: 'merge',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function readPositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
}
