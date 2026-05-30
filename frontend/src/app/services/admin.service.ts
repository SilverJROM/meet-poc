import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type AdminUser = {
  email: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: number;
  telegramUsername: string | null;
};

export type CreateUserPayload = {
  email: string;
  password: string;
  displayName?: string;
  isAdmin?: boolean;
};

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  async listUsers(): Promise<AdminUser[]> {
    const res = await firstValueFrom(this.http.get<{ users: AdminUser[] }>('/api/admin/users'));
    return res.users;
  }

  async createUser(payload: CreateUserPayload): Promise<AdminUser> {
    const res = await firstValueFrom(this.http.post<{ user: AdminUser }>('/api/admin/users', payload));
    return res.user;
  }

  // R5 (B3b): global diagnostics kill-switch. The endpoint URL lives ONLY here.
  async getDiagnosticsEnabled(): Promise<boolean> {
    const res = await firstValueFrom(this.http.get<{ enabled: boolean }>('/api/admin/settings/diagnostics'));
    return res.enabled;
  }

  async setDiagnosticsEnabled(enabled: boolean): Promise<boolean> {
    const res = await firstValueFrom(
      this.http.put<{ enabled: boolean }>('/api/admin/settings/diagnostics', { enabled }),
    );
    return res.enabled;
  }
}
