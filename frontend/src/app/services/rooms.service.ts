import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type Room = {
  id: string;
  title: string;
  ownerEmail: string;
  createdAt: number;
};

@Injectable({ providedIn: 'root' })
export class RoomsService {
  private readonly http = inject(HttpClient);

  async list(): Promise<Room[]> {
    const res = await firstValueFrom(this.http.get<{ rooms: Room[] }>('/api/rooms'));
    return res.rooms;
  }

  async create(title: string): Promise<Room> {
    const res = await firstValueFrom(this.http.post<{ room: Room }>('/api/rooms', { title }));
    return res.room;
  }

  async delete(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<{ ok: true }>(`/api/rooms/${encodeURIComponent(id)}`));
  }

  async exists(id: string): Promise<{ exists: boolean; title?: string }> {
    return firstValueFrom(this.http.get<{ exists: boolean; title?: string }>(`/api/rooms/${encodeURIComponent(id)}/exists`));
  }
}
