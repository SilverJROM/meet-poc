import { Component, CUSTOM_ELEMENTS_SCHEMA, HostListener, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { addIcons } from 'ionicons';
import { checkmarkOutline, chevronDownOutline, chevronUpOutline, clipboardOutline, closeOutline, createOutline, ellipsisHorizontal, keyOutline, lockClosedOutline, lockOpenOutline, searchOutline, trashOutline, videocamOutline } from 'ionicons/icons';
import { PaginationComponent } from '../../components/pagination/pagination.component';
import { pendingRecordingSessionIds, reconcilePendingRecordings } from '../../services/recording-pending';
import { RecordingsService } from '../../services/recordings.service';
import { Room, RoomsService } from '../../services/rooms.service';

const DEFAULT_PAGE_SIZE = 20;

@Component({
  selector: 'app-rooms-page',
  standalone: true,
  imports: [FormsModule, RouterLink, PaginationComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './rooms.page.html',
  styleUrl: './rooms.page.scss',
})
export class RoomsPage implements OnDestroy {
  private readonly roomsService = inject(RoomsService);
  private readonly recordingsService = inject(RecordingsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly querySub: Subscription;

  readonly rooms = signal<Room[]>([]);
  readonly page = signal(1);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly accessBusyId = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly copyStatus = signal<string | null>(null);
  readonly newTitle = signal('');
  readonly searchQuery = signal('');
  readonly origin = window.location.origin;
  readonly hasRooms = computed(() => this.rooms().length > 0);
  readonly editingTitleId = signal<string | null>(null);
  readonly editingPasswordId = signal<string | null>(null);
  readonly passwordExpandedId = signal<string | null>(null);
  readonly menuOpenId = signal<string | null>(null);
  readonly titleDraft = signal('');
  readonly passwordDraft = signal('');
  readonly editBusyId = signal<string | null>(null);
  readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  readonly selectedCount = computed(() => this.selectedIds().size);
  readonly pendingRecordingWarning = signal(false);
  readonly allOnPageSelected = computed(() => {
    const ids = this.rooms();
    if (ids.length === 0) return false;
    const selected = this.selectedIds();
    return ids.every((r) => selected.has(r.id));
  });

  constructor() {
    addIcons({ checkmarkOutline, chevronDownOutline, chevronUpOutline, clipboardOutline, closeOutline, createOutline, ellipsisHorizontal, keyOutline, lockClosedOutline, lockOpenOutline, searchOutline, trashOutline, videocamOutline });
    this.pendingRecordingWarning.set(pendingRecordingSessionIds().length > 0);
    void this.reconcilePendingRecordingMarkers();
    this.querySub = this.route.queryParamMap.subscribe((params) => {
      this.page.set(readPositiveInt(params.get('page'), 1));
      this.pageSize.set(Math.min(readPositiveInt(params.get('pageSize'), DEFAULT_PAGE_SIZE), 100));
      this.searchQuery.set((params.get('q') || '').trim());
      void this.refreshRooms();
    });
  }

  ngOnDestroy(): void {
    this.querySub.unsubscribe();
  }

  dismissRecordingWarning(): void {
    this.pendingRecordingWarning.set(false);
  }

  private async reconcilePendingRecordingMarkers(): Promise<void> {
    const result = await reconcilePendingRecordings(this.recordingsService);
    this.pendingRecordingWarning.set(result.pendingSessionIds.length > 0);
  }

  toggleMenu(roomId: string, event?: Event): void {
    event?.stopPropagation();
    this.menuOpenId.set(this.menuOpenId() === roomId ? null : roomId);
    // Closing the overflow also exits any inline edit started from within it.
    if (this.menuOpenId() === null) {
      this.editingTitleId.set(null);
      this.editingPasswordId.set(null);
    }
  }

  closeMenu(): void {
    this.menuOpenId.set(null);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.menuOpenId.set(null);
  }

  shareUrl(room: Room): string {
    return `${this.origin}/room/${this.roomUrlKey(room)}`;
  }

  joinUrl(room: Room): string {
    return `${this.origin}/join/${this.roomUrlKey(room)}`;
  }

  roomUrlKey(room: Room): string {
    return room.slug || room.id;
  }

  async refreshRooms(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.roomsService.list({ page: this.page(), pageSize: this.pageSize(), q: this.searchQuery() });
      this.rooms.set(result.rooms);
      this.total.set(result.total);
    } catch {
      this.error.set('Rooms could not be loaded');
    } finally {
      this.loading.set(false);
    }
  }

  async updateSearchQuery(value: string): Promise<void> {
    const q = value.trim();
    this.searchQuery.set(value);
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: q || null, page: 1 },
      queryParamsHandling: 'merge',
    });
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

  async copyJoinLink(room: Room): Promise<void> {
    const url = this.joinUrl(room);
    try {
      await navigator.clipboard.writeText(url);
      this.copyStatus.set('Copied guest link');
    } catch {
      window.prompt('Copy guest link', url);
      this.copyStatus.set('Guest link ready to copy');
    }
  }

  startEditTitle(room: Room, event?: Event): void {
    event?.stopPropagation();
    this.titleDraft.set(room.title);
    this.editingTitleId.set(room.id);
  }

  cancelEditTitle(event?: Event): void {
    event?.stopPropagation();
    this.editingTitleId.set(null);
    this.titleDraft.set('');
  }

  async saveEditTitle(room: Room, event?: Event): Promise<void> {
    event?.stopPropagation();
    const value = this.titleDraft().trim();
    if (!value || value === room.title) {
      this.cancelEditTitle();
      return;
    }
    this.editBusyId.set(room.id);
    this.error.set(null);
    try {
      const updated = await this.roomsService.setTitle(room.id, value);
      this.rooms.update((rooms) => rooms.map((item) => (item.id === updated.id ? updated : item)));
      this.copyStatus.set('Room renamed');
      this.editingTitleId.set(null);
      this.titleDraft.set('');
    } catch {
      this.error.set('Room name could not be saved');
    } finally {
      this.editBusyId.set(null);
    }
  }

  togglePasswordExpanded(room: Room, event?: Event): void {
    event?.stopPropagation();
    const next = this.passwordExpandedId() === room.id ? null : room.id;
    this.passwordExpandedId.set(next);
    if (next === null) this.editingPasswordId.set(null);
  }

  startEditPassword(room: Room, event?: Event): void {
    event?.stopPropagation();
    this.editingTitleId.set(null);
    this.passwordDraft.set('');
    this.passwordExpandedId.set(room.id);
    this.editingPasswordId.set(room.id);
  }

  cancelEditPassword(event?: Event): void {
    event?.stopPropagation();
    this.editingPasswordId.set(null);
    this.passwordDraft.set('');
  }

  async saveEditPassword(room: Room, event?: Event): Promise<void> {
    event?.stopPropagation();
    const value = this.passwordDraft();
    if (value.length > 200) {
      this.error.set('Password too long');
      return;
    }
    this.editBusyId.set(room.id);
    this.error.set(null);
    try {
      const updated = await this.roomsService.setPassword(room.id, value);
      this.rooms.update((rooms) => rooms.map((item) => (item.id === updated.id ? updated : item)));
      this.copyStatus.set(value ? 'Password set' : 'Password removed');
      this.editingPasswordId.set(null);
      this.passwordDraft.set('');
    } catch {
      this.error.set('Password could not be saved');
    } finally {
      this.editBusyId.set(null);
    }
  }

  async clearPassword(room: Room, event?: Event): Promise<void> {
    event?.stopPropagation();
    if (!window.confirm(`Remove password from "${room.title}"?`)) return;
    this.editBusyId.set(room.id);
    this.error.set(null);
    try {
      const updated = await this.roomsService.setPassword(room.id, '');
      this.rooms.update((rooms) => rooms.map((item) => (item.id === updated.id ? updated : item)));
      this.copyStatus.set('Password removed');
    } catch {
      this.error.set('Password could not be removed');
    } finally {
      this.editBusyId.set(null);
    }
  }

  async deleteRoom(room: Room, event?: Event): Promise<void> {
    event?.stopPropagation();
    if (!window.confirm(`Delete "${room.title}"? This cannot be undone.`)) return;
    await this.roomsService.delete(room.id);
    await this.refreshRooms();
  }

  async toggleRoomOpen(room: Room, event?: Event): Promise<void> {
    event?.stopPropagation();
    await this.updateRoomAccess(room, !room.isOpen, room.waitTimeoutMinutes);
  }

  async updateWaitTimeout(room: Room, rawValue: string, event?: Event): Promise<void> {
    event?.stopPropagation();
    const next = Number(rawValue);
    if (!Number.isFinite(next) || next <= 0 || next > 240 || next === room.waitTimeoutMinutes) return;
    await this.updateRoomAccess(room, room.isOpen, next);
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  toggleSelection(id: string): void {
    const next = new Set(this.selectedIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedIds.set(next);
  }

  toggleSelectAllOnPage(): void {
    const ids = this.rooms().map((r) => r.id);
    const selected = this.selectedIds();
    const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
    const next = new Set(selected);
    if (allOn) {
      for (const id of ids) next.delete(id);
    } else {
      for (const id of ids) next.add(id);
    }
    this.selectedIds.set(next);
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  async bulkDeleteSelected(): Promise<void> {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;
    const noun = ids.length === 1 ? 'room' : 'rooms';
    if (!window.confirm(`Delete ${ids.length} ${noun}? This cannot be undone.`)) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const { deleted } = await this.roomsService.bulkDelete(ids);
      this.copyStatus.set(`Deleted ${deleted} ${deleted === 1 ? 'room' : 'rooms'}`);
      this.clearSelection();
      await this.refreshRooms();
    } catch {
      this.error.set('Bulk delete failed');
    } finally {
      this.busy.set(false);
    }
  }

  private async updateRoomAccess(room: Room, isOpen: boolean, waitTimeoutMinutes: number): Promise<void> {
    if (this.accessBusyId()) return;
    this.accessBusyId.set(room.id);
    this.error.set(null);
    try {
      const updated = await this.roomsService.setAccess(room.id, isOpen, waitTimeoutMinutes);
      this.rooms.update((rooms) => rooms.map((item) => (item.id === updated.id ? updated : item)));
      this.copyStatus.set(updated.isOpen ? 'Room opened' : 'Room closed');
    } catch {
      this.error.set('Room access could not be updated');
    } finally {
      this.accessBusyId.set(null);
    }
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
