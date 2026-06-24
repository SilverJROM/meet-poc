import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type AdminUser = {
  email: string;
  displayName: string;
  isAdmin: boolean;
  protected?: boolean;
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

  private userPath(email: string): string {
    return `/api/admin/users/${encodeURIComponent(email)}`;
  }

  async listUsers(): Promise<AdminUser[]> {
    const res = await firstValueFrom(this.http.get<{ users: AdminUser[] }>('/api/admin/users'));
    return res.users;
  }

  async createUser(payload: CreateUserPayload): Promise<AdminUser> {
    const res = await firstValueFrom(this.http.post<{ user: AdminUser }>('/api/admin/users', payload));
    return res.user;
  }

  async deleteUser(email: string): Promise<void> {
    await firstValueFrom(this.http.delete<{ ok: boolean }>(this.userPath(email)));
  }

  async setUserAdmin(email: string, isAdmin: boolean): Promise<void> {
    await firstValueFrom(this.http.patch<{ ok: boolean; isAdmin: boolean }>(`${this.userPath(email)}/role`, { isAdmin }));
  }

  async setDisplayName(email: string, displayName: string): Promise<void> {
    await firstValueFrom(this.http.patch<{ ok: boolean; displayName: string }>(this.userPath(email), { displayName }));
  }

  async changeEmail(email: string, newEmail: string): Promise<void> {
    await firstValueFrom(
      this.http.patch<{ ok: boolean; email: string }>(`${this.userPath(email)}/email`, { newEmail }),
    );
  }

  async resetPassword(email: string, newPassword: string): Promise<void> {
    await firstValueFrom(
      this.http.post<{ ok: boolean }>(`${this.userPath(email)}/reset-password`, { newPassword }),
    );
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