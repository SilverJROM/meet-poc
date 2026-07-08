import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type Room = {
  id: string;
  title: string;
  slug: string;
  ownerEmail: string;
  isOpen: boolean;
  waitTimeoutMinutes: number;
  createdAt: number;
  passwordRequired: boolean;
  autoAdmit: boolean;
};

export type PaginatedRooms = {
  rooms: Room[];
  page: number;
  pageSize: number;
  total: number;
};

@Injectable({ providedIn: 'root' })
export class RoomsService {
  private readonly http = inject(HttpClient);

  async list(options: { page: number; pageSize: number; q?: string }): Promise<PaginatedRooms> {
    const params: Record<string, string> = {
      page: String(options.page),
      pageSize: String(options.pageSize),
    };
    if (options.q?.trim()) params['q'] = options.q.trim();
    const res = await firstValueFrom(
      this.http.get<PaginatedRooms>('/api/rooms', {
        params,
      }),
    );
    return res;
  }

  async create(title: string, autoAdmit = false): Promise<Room> {
    const res = await firstValueFrom(this.http.post<{ room: Room }>('/api/rooms', { title, autoAdmit }));
    return res.room;
  }

  async delete(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<{ ok: true }>(`/api/rooms/${encodeURIComponent(id)}`));
  }

  async bulkDelete(ids: string[]): Promise<{ deleted: number; requested: number }> {
    const res = await firstValueFrom(
      this.http.post<{ ok: true; deleted: number; requested: number }>('/api/rooms/bulk-delete', { ids }),
    );
    return { deleted: res.deleted, requested: res.requested };
  }

  async exists(id: string): Promise<{ exists: boolean; id?: string; title?: string; slug?: string; isOpen?: boolean; waitTimeoutMinutes?: number; passwordRequired?: boolean; autoAdmit?: boolean; isOwner?: boolean }> {
    return firstValueFrom(
      this.http.get<{ exists: boolean; id?: string; title?: string; slug?: string; isOpen?: boolean; waitTimeoutMinutes?: number; passwordRequired?: boolean; autoAdmit?: boolean; isOwner?: boolean }>(
        `/api/rooms/${encodeURIComponent(id)}/exists`,
      ),
    );
  }

  async setTitle(id: string, title: string): Promise<Room> {
    const res = await firstValueFrom(this.http.put<{ room: Room }>(`/api/rooms/${encodeURIComponent(id)}/title`, { title }));
    return res.room;
  }

  async setSlug(id: string, slug: string): Promise<Room> {
    const res = await firstValueFrom(this.http.put<{ room: Room }>(`/api/rooms/${encodeURIComponent(id)}/slug`, { slug }));
    return res.room;
  }

  async setPassword(id: string, password: string): Promise<Room> {
    const res = await firstValueFrom(this.http.put<{ room: Room }>(`/api/rooms/${encodeURIComponent(id)}/password`, { password }));
    return res.room;
  }

  async verifyPassword(slugOrId: string, password: string): Promise<boolean> {
    try {
      await firstValueFrom(
        this.http.post<{ ok: true }>(`/api/rooms/by-slug/${encodeURIComponent(slugOrId)}/verify-password`, { password }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async setAccess(id: string, isOpen: boolean, waitTimeoutMinutes: number, autoAdmit?: boolean): Promise<Room> {
    const res = await firstValueFrom(
      this.http.put<{ room: Room }>(`/api/rooms/${encodeURIComponent(id)}/access`, { isOpen, waitTimeoutMinutes, autoAdmit }),
    );
    return res.room;
  }
}
