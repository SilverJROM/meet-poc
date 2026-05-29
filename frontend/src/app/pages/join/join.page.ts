import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { RoomsService } from '../../services/rooms.service';

type RoomLookup = {
  room: {
    id: string;
    slug: string;
    title: string;
    isOpen: boolean;
    passwordRequired?: boolean;
  };
};

const GUEST_DISPLAY_NAME_KEY = 'guestDisplayName';
const ROOM_PASSWORD_PREFIX = 'meet-poc.roompw.';

@Component({
  selector: 'app-join-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './join.page.html',
  styleUrl: './join.page.scss',
})
export class JoinPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly rooms = inject(RoomsService);

  readonly roomCode = signal('');
  readonly displayName = signal(readGuestDisplayName());
  readonly roomPassword = signal('');
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly ready = signal(false);
  // Set once we've found a room that needs a password — reveals the password field.
  readonly needsPassword = signal(false);
  readonly foundRoomTitle = signal<string | null>(null);

  readonly user = this.auth.user;
  readonly signedIn = computed(() => !!this.auth.user());
  readonly accountName = computed(() => {
    const u = this.auth.user();
    return u ? u.displayName || u.email.split('@')[0] || u.email : '';
  });

  async ngOnInit(): Promise<void> {
    await this.auth.ensureSession();
    this.ready.set(true);
  }

  // Reset the password step if the user edits the room name/code again.
  onRoomCodeChange(value: string): void {
    this.roomCode.set(value);
    if (this.needsPassword()) {
      this.needsPassword.set(false);
      this.foundRoomTitle.set(null);
      this.roomPassword.set('');
    }
    this.error.set(null);
  }

  async submitJoin(): Promise<void> {
    if (this.busy()) return;
    const entered = this.roomCode().trim();
    if (!entered) {
      this.error.set('Enter a room name or code.');
      return;
    }
    const signedIn = this.signedIn();
    const name = this.displayName().trim();
    if (!signedIn && !name) {
      this.error.set('Room name/code and your name are required.');
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      const room = await this.lookupRoom(entered);
      if (!room) {
        this.error.set('Room not found. Check the name or code.');
        return;
      }
      const slug = room.slug || room.id;

      if (room.passwordRequired) {
        if (!this.needsPassword()) {
          // First match — reveal the password field; don't navigate yet.
          this.needsPassword.set(true);
          this.foundRoomTitle.set(room.title);
          return;
        }
        const pw = this.roomPassword();
        if (!pw) {
          this.error.set('Enter the room password.');
          return;
        }
        const ok = await this.rooms.verifyPassword(slug, pw);
        if (!ok) {
          this.error.set('Incorrect room password.');
          return;
        }
        // Stash so the room page joins without prompting again.
        storeRoomPassword(slug, pw);
      }

      if (signedIn) {
        await this.router.navigate(['/room', slug]);
      } else {
        storeGuestDisplayName(name);
        await this.router.navigate(['/join', slug]);
      }
    } catch {
      this.error.set('Room not found. Check the name or code.');
    } finally {
      this.busy.set(false);
    }
  }

  // Try the raw value (exact slug/code/id), then a slugified version of the
  // room name (so "JROM Room" resolves to the room with slug "jrom-room").
  private async lookupRoom(entered: string): Promise<RoomLookup['room'] | null> {
    const candidates = [entered];
    const slugged = slugify(entered);
    if (slugged && slugged !== entered.toLowerCase()) candidates.push(slugged);
    for (const key of candidates) {
      try {
        const res = await firstValueFrom(this.http.get<RoomLookup>(`/api/rooms/by-slug/${encodeURIComponent(key)}`));
        if (res?.room) return res.room;
      } catch {
        // try next candidate
      }
    }
    return null;
  }
}

function slugify(value: string): string {
  const base = value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return base.slice(0, 48).replace(/-+$/g, '');
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

function storeRoomPassword(slug: string, password: string): void {
  try {
    window.sessionStorage.setItem(ROOM_PASSWORD_PREFIX + slug, password);
  } catch {
    // Best effort only.
  }
}
