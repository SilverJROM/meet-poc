import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type PasswordlessChallengeStatus = 'pending' | 'approved' | 'denied' | 'expired';

export type PasswordlessSettings = {
  linked: boolean;
  status: 'off' | 'active' | 'pending';
  displayNumber?: number;
  pollAfterMs?: number;
};

export type PasswordlessStartResult =
  | { eligible: false }
  | {
      eligible: true;
      challengeToken: string;
      displayNumber: number;
      expiresAt: number;
      pollAfterMs: number;
    };

export type PasswordlessEnrollResult = {
  challengeToken: string;
  displayNumber: number;
  expiresAt: number;
  pollAfterMs: number;
};

@Injectable({ providedIn: 'root' })
export class TelegramPasswordlessService {
  private readonly http = inject(HttpClient);

  start(email: string, turnstileToken = ''): Promise<PasswordlessStartResult> {
    return firstValueFrom(
      this.http.post<PasswordlessStartResult>('/api/telegram/passwordless/start', { email, turnstileToken }),
    );
  }

  status(challengeToken: string): Promise<{ status: PasswordlessChallengeStatus }> {
    return firstValueFrom(
      this.http.get<{ status: PasswordlessChallengeStatus }>('/api/telegram/passwordless/status', {
        params: { challengeToken },
      }),
    );
  }

  complete(challengeToken: string): Promise<{ ok: true; email: string }> {
    return firstValueFrom(
      this.http.post<{ ok: true; email: string }>('/api/telegram/passwordless/complete', { challengeToken }),
    );
  }

  settings(): Promise<PasswordlessSettings> {
    return firstValueFrom(this.http.get<PasswordlessSettings>('/api/telegram/passwordless/settings'));
  }

  enroll(): Promise<PasswordlessEnrollResult> {
    return firstValueFrom(
      this.http.post<PasswordlessEnrollResult>('/api/telegram/passwordless/enroll', {}),
    );
  }

  verifyActivate(challengeToken: string): Promise<{ ok: true; status: 'active' }> {
    return firstValueFrom(
      this.http.post<{ ok: true; status: 'active' }>('/api/telegram/passwordless/verify-activate', {
        challengeToken,
      }),
    );
  }

  disable(password: string): Promise<{ ok: true; status: 'off' }> {
    return firstValueFrom(
      this.http.post<{ ok: true; status: 'off' }>('/api/telegram/passwordless/disable', { password }),
    );
  }
}