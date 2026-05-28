import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

type RoomLookupResponse = {
  room: {
    id: string;
    slug: string;
    title: string;
    isOpen: boolean;
  };
};

const GUEST_DISPLAY_NAME_KEY = 'guestDisplayName';

@Component({
  selector: 'app-join-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './join.page.html',
  styleUrl: './join.page.scss',
})
export class JoinPage {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly roomCode = signal('');
  readonly displayName = signal(readGuestDisplayName());
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  async submitJoin(): Promise<void> {
    if (this.busy()) return;
    const code = this.roomCode().trim();
    const name = this.displayName().trim();
    if (!code || !name) {
      this.error.set('Room code and name are required.');
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(this.http.get<RoomLookupResponse>(`/api/rooms/by-slug/${encodeURIComponent(code)}`));
      storeGuestDisplayName(name);
      await this.router.navigate(['/join', res.room.slug || res.room.id]);
    } catch {
      this.error.set('Room not found.');
    } finally {
      this.busy.set(false);
    }
  }
}

function readGuestDisplayName(): string {
  try {
    return window.sessionStorage.getItem(GUEST_DISPLAY_NAME_KEY) || '';
  } catch {
    return '';
  }
}

function storeGuestDisplayName(name: string): void {
  try {
    window.sessionStorage.setItem(GUEST_DISPLAY_NAME_KEY, name);
  } catch {
    // Best effort only.
  }
}
