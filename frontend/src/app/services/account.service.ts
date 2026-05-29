import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly http = inject(HttpClient);

  async setDisplayName(displayName: string): Promise<{ displayName: string }> {
    return firstValueFrom(
      this.http.put<{ displayName: string }>('/api/account/display-name', { displayName }),
    );
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await firstValueFrom(
      this.http.put('/api/account/password', { currentPassword, newPassword }),
    );
  }

  async changeEmail(newEmail: string, password: string): Promise<{ email: string }> {
    return firstValueFrom(
      this.http.put<{ email: string }>('/api/account/email', { newEmail, password }),
    );
  }

  async telegramStatus(): Promise<{ linked: boolean; username?: string | null; firstName?: string | null }> {
    return firstValueFrom(
      this.http.get<{ linked: boolean; username?: string | null; firstName?: string | null }>('/api/account/telegram'),
    );
  }

  async unlinkTelegram(): Promise<{ removed: number }> {
    return firstValueFrom(this.http.delete<{ ok: true; removed: number }>('/api/account/telegram'));
  }
}
