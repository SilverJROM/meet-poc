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
}
