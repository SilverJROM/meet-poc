import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type User = {
  email: string;
};

type MeResponse = {
  user: User | null;
};

type LoginResponse = {
  email: string;
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
    const promise = firstValueFrom(this.http.get<MeResponse>('/api/me')).then((res) => {
      this.user.set(res.user);
      this.sessionPromise.set(null);
      return res.user;
    }).catch(() => {
      this.user.set(null);
      this.sessionPromise.set(null);
      return null;
    });
    this.sessionPromise.set(promise);
    return promise;
  }

  async login(email: string, password: string): Promise<User> {
    const res = await firstValueFrom(this.http.post<LoginResponse>('/api/login', { email, password }));
    const user = { email: res.email };
    this.user.set(user);
    return user;
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post('/api/logout', {})).catch(() => undefined);
    this.user.set(null);
  }
}
