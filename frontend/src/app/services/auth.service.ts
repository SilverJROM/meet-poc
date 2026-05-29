import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type User = {
  email: string;
  displayName: string;
  isAdmin: boolean;
};

type MeResponse = {
  user: User | null;
};

type LoginResponse = {
  email: string;
  displayName: string;
  isAdmin: boolean;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly sessionPromise = signal<Promise<User | null> | null>(null);

  readonly user = signal<User | null | undefined>(undefined);
  readonly isAuthenticated = computed(() => !!this.user());

  async ensureSession(): Promise<User | null> {
    if (this.user() !== undefined) return this.user() ?? null;
    return this.checkSession();
  }

  async checkSession(): Promise<User | null> {
    const existing = this.sessionPromise();
    if (existing) return existing;
    const promise = firstValueFrom(this.http.get<MeResponse>('/api/me'))
      .then(async (res) => {
        if (res.user) {
          this.user.set(res.user);
          return res.user;
        }
        const tgUser = await this.tryTelegramAuth();
        this.user.set(tgUser);
        return tgUser;
      })
      .catch(async () => {
        const tgUser = await this.tryTelegramAuth();
        this.user.set(tgUser);
        return tgUser;
      })
      .finally(() => this.sessionPromise.set(null));
    this.sessionPromise.set(promise);
    return promise;
  }

  private async tryTelegramAuth(): Promise<User | null> {
    const initData = readTelegramInitData();
    if (!initData) return null;
    try {
      const res = await firstValueFrom(
        this.http.post<LoginResponse>('/api/auth/telegram', { initData }),
      );
      return { email: res.email, displayName: res.displayName, isAdmin: res.isAdmin };
    } catch {
      return null;
    }
  }

  async login(email: string, password: string): Promise<User> {
    const res = await firstValueFrom(this.http.post<LoginResponse>('/api/login', { email, password }));
    const user: User = { email: res.email, displayName: res.displayName, isAdmin: res.isAdmin };
    this.user.set(user);
    return user;
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post('/api/logout', {})).catch(() => undefined);
    this.user.set(null);
  }

  patchUser(partial: Partial<User>): void {
    const current = this.user();
    if (!current) return;
    this.user.set({ ...current, ...partial });
  }
}

function readTelegramInitData(): string | null {
  const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
  const data = tg?.initData;
  return data && data.length > 0 ? data : null;
}
