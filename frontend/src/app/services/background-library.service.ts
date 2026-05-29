import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type AccountBackground = {
  id: string;
  label: string;
  mime: string;
  ext: string;
  sizeBytes: number;
  createdAt: number;
};

export type BackgroundListResponse = {
  backgrounds: AccountBackground[];
  used: number;
  quota: number | null;
  isAdmin: boolean;
};

@Injectable({ providedIn: 'root' })
export class BackgroundLibraryService {
  private readonly http = inject(HttpClient);

  imageUrl(id: string): string {
    return `/api/account/backgrounds/${encodeURIComponent(id)}/image`;
  }

  async list(): Promise<BackgroundListResponse> {
    return firstValueFrom(this.http.get<BackgroundListResponse>('/api/account/backgrounds'));
  }

  async upload(label: string, dataUrl: string): Promise<{ background: AccountBackground; used: number }> {
    return firstValueFrom(
      this.http.post<{ background: AccountBackground; used: number }>('/api/account/backgrounds', { label, dataUrl }),
    );
  }

  async remove(id: string): Promise<{ used: number }> {
    return firstValueFrom(this.http.delete<{ ok: true; used: number }>(`/api/account/backgrounds/${encodeURIComponent(id)}`));
  }
}
