import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';
import { eye, eyeOff } from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { TelegramPasswordlessService } from '../../services/telegram-passwordless.service';

type TgLoginPhase = 'idle' | 'ineligible' | 'number' | 'denied' | 'expired';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
export class LoginPage implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly passwordless = inject(TelegramPasswordlessService);

  email = '';
  password = '';
  readonly showPassword = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly tgBusy = signal(false);
  readonly tgPhase = signal<TgLoginPhase>('idle');
  readonly tgDisplayNumber = signal<number | null>(null);

  private challengeToken: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    addIcons({ eye, eyeOff });
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  async onSubmit(): Promise<void> {
    if (!this.email || !this.password) {
      this.error.set('Email and password are required');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.auth.login(this.email, this.password);
      await this.router.navigate(['/app/rooms']);
    } catch {
      this.error.set('Invalid email or password');
    } finally {
      this.loading.set(false);
    }
  }

  async onTelegramLogin(): Promise<void> {
    const email = this.email.trim();
    if (!email) {
      this.error.set('Enter your email first to sign in with Telegram');
      this.resetTgFlow();
      return;
    }

    this.tgBusy.set(true);
    this.error.set(null);
    this.resetTgFlow();

    try {
      const result = await this.passwordless.start(email);
      if (!result.eligible) {
        this.tgPhase.set('ineligible');
        return;
      }

      this.challengeToken = result.challengeToken;
      this.tgDisplayNumber.set(result.displayNumber);
      this.tgPhase.set('number');
      this.startPolling(result.pollAfterMs);
    } catch {
      this.error.set('Telegram sign-in could not be started');
      this.resetTgFlow();
    } finally {
      this.tgBusy.set(false);
    }
  }

  retryTelegramLogin(): void {
    this.resetTgFlow();
    void this.onTelegramLogin();
  }

  private startPolling(intervalMs: number): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      void this.pollStatus();
    }, intervalMs);
    void this.pollStatus();
  }

  private async pollStatus(): Promise<void> {
    const token = this.challengeToken;
    if (!token || this.tgBusy()) return;

    try {
      const { status } = await this.passwordless.status(token);
      if (status === 'pending') return;

      this.stopPolling();

      if (status === 'approved') {
        this.tgBusy.set(true);
        try {
          await this.passwordless.complete(token);
          const user = await this.auth.refreshSession();
          if (user) {
            await this.router.navigate(['/app/rooms']);
            return;
          }
          this.error.set('Signed in, but session could not be loaded');
        } catch {
          this.error.set('Telegram sign-in could not be completed');
        } finally {
          this.tgBusy.set(false);
          this.resetTgFlow();
        }
        return;
      }

      this.challengeToken = null;
      this.tgDisplayNumber.set(null);
      this.tgPhase.set(status === 'denied' ? 'denied' : 'expired');
    } catch {
      this.stopPolling();
      this.error.set('Telegram sign-in status check failed');
      this.resetTgFlow();
    }
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private resetTgFlow(): void {
    this.stopPolling();
    this.challengeToken = null;
    this.tgDisplayNumber.set(null);
    this.tgPhase.set('idle');
  }
}