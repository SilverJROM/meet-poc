import { HttpErrorResponse } from '@angular/common/http';
import { CUSTOM_ELEMENTS_SCHEMA, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';
import { keyOutline, linkOutline, mailOutline, personOutline, saveOutline, unlinkOutline } from 'ionicons/icons';
import { AccountService } from '../../services/account.service';
import { AuthService } from '../../services/auth.service';
import { readDiagnosticsLoggingEnabled, writeDiagnosticsLoggingEnabled } from '../../services/diagnostics-prefs';
import { TelegramPasswordlessService } from '../../services/telegram-passwordless.service';

@Component({
  selector: 'app-account-settings',
  standalone: true,
  imports: [FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './account-settings.component.html',
  styleUrl: './account-settings.component.scss',
})
export class AccountSettingsComponent implements OnInit, OnDestroy {
  private readonly account = inject(AccountService);
  private readonly auth = inject(AuthService);
  private readonly passwordless = inject(TelegramPasswordlessService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly email = computed(() => this.auth.user()?.email ?? '');

  readonly displayNameDraft = signal('');
  readonly savingName = signal(false);
  readonly status = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly currentPassword = signal('');
  readonly newPassword = signal('');
  readonly confirmPassword = signal('');
  readonly savingPassword = signal(false);
  readonly passwordStatus = signal<string | null>(null);
  readonly passwordError = signal<string | null>(null);

  readonly newEmail = signal('');
  readonly emailPassword = signal('');
  readonly savingEmail = signal(false);
  readonly emailStatus = signal<string | null>(null);
  readonly emailError = signal<string | null>(null);

  readonly tgLoading = signal(true);
  readonly tgLinked = signal(false);
  readonly tgUsername = signal<string | null>(null);
  readonly tgBusy = signal(false);
  readonly tgStatus = signal<string | null>(null);
  readonly tgError = signal<string | null>(null);

  // R4 (B3a): diagnostics-logging on/off, seeded from the shared prefs reader
  // (absent key -> ON). Persists locally on change; no backend.
  readonly diagnosticsLogging = signal(readDiagnosticsLoggingEnabled());

  readonly pwdlessLoading = signal(true);
  readonly pwdlessBusy = signal(false);
  readonly pwdlessLinked = signal(false);
  readonly pwdlessStatus = signal<'off' | 'active' | 'pending'>('off');
  readonly pwdlessDisplayNumber = signal<number | null>(null);
  readonly pwdlessError = signal<string | null>(null);
  readonly pwdlessStatusMsg = signal<string | null>(null);
  readonly pwdlessDisablePassword = signal('');
  readonly pwdlessShowDisable = signal(false);

  private enrollChallengeToken: string | null = null;
  private enrollPollTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    addIcons({ keyOutline, linkOutline, mailOutline, personOutline, saveOutline, unlinkOutline });
    const current = this.auth.user();
    this.displayNameDraft.set(current?.displayName ?? '');
  }

  ngOnInit(): void {
    void this.loadTelegram();
    void this.loadPasswordless();
  }

  ngOnDestroy(): void {
    this.stopEnrollPolling();
  }

  private async loadTelegram(): Promise<void> {
    this.tgLoading.set(true);
    try {
      const status = await this.account.telegramStatus();
      this.tgLinked.set(status.linked);
      this.tgUsername.set(status.username ?? status.firstName ?? null);
    } catch {
      this.tgError.set('Could not load Telegram status.');
    } finally {
      this.tgLoading.set(false);
    }
  }

  private async loadPasswordless(): Promise<void> {
    this.pwdlessLoading.set(true);
    this.pwdlessError.set(null);
    try {
      const settings = await this.passwordless.settings();
      this.pwdlessLinked.set(settings.linked);
      this.pwdlessStatus.set(settings.status);
      if (settings.status === 'pending' && settings.displayNumber !== undefined) {
        this.pwdlessDisplayNumber.set(settings.displayNumber);
      }
    } catch {
      this.pwdlessError.set('Could not load passwordless login status.');
    } finally {
      this.pwdlessLoading.set(false);
    }
  }

  async enablePasswordless(): Promise<void> {
    if (!this.pwdlessLinked()) return;
    this.pwdlessBusy.set(true);
    this.pwdlessError.set(null);
    this.pwdlessStatusMsg.set(null);
    this.stopEnrollPolling();
    this.enrollChallengeToken = null;
    this.pwdlessDisplayNumber.set(null);

    try {
      const result = await this.passwordless.enroll();
      this.enrollChallengeToken = result.challengeToken;
      this.pwdlessDisplayNumber.set(result.displayNumber);
      this.pwdlessStatus.set('pending');
      this.pwdlessStatusMsg.set('Tap the number in Telegram to finish activation.');
      this.startEnrollPolling(result.pollAfterMs);
    } catch (err) {
      const message = err instanceof HttpErrorResponse && typeof err.error?.error === 'string'
        ? err.error.error
        : 'Could not start activation test.';
      this.pwdlessError.set(message);
    } finally {
      this.pwdlessBusy.set(false);
    }
  }

  showDisablePasswordless(): void {
    this.pwdlessShowDisable.set(true);
    this.pwdlessDisablePassword.set('');
    this.pwdlessError.set(null);
    this.pwdlessStatusMsg.set(null);
  }

  cancelDisablePasswordless(): void {
    this.pwdlessShowDisable.set(false);
    this.pwdlessDisablePassword.set('');
  }

  async disablePasswordless(): Promise<void> {
    const password = this.pwdlessDisablePassword();
    if (!password) {
      this.pwdlessError.set('Enter your password to disable passwordless login.');
      return;
    }
    this.pwdlessBusy.set(true);
    this.pwdlessError.set(null);
    this.pwdlessStatusMsg.set(null);
    try {
      await this.passwordless.disable(password);
      this.pwdlessStatus.set('off');
      this.pwdlessShowDisable.set(false);
      this.pwdlessDisablePassword.set('');
      this.pwdlessStatusMsg.set('Passwordless Telegram login disabled.');
      this.auth.user.set(null);
      await this.router.navigate(['/login']);
    } catch (err) {
      const message = err instanceof HttpErrorResponse && err.status === 401
        ? 'Password is incorrect.'
        : err instanceof HttpErrorResponse && typeof err.error?.error === 'string'
          ? err.error.error
          : 'Could not disable passwordless login.';
      this.pwdlessError.set(message);
    } finally {
      this.pwdlessBusy.set(false);
    }
  }

  private startEnrollPolling(intervalMs: number): void {
    this.stopEnrollPolling();
    this.enrollPollTimer = setInterval(() => {
      void this.pollEnrollStatus();
    }, intervalMs);
    void this.pollEnrollStatus();
  }

  private async pollEnrollStatus(): Promise<void> {
    const token = this.enrollChallengeToken;
    if (!token || this.pwdlessBusy()) return;

    try {
      const { status } = await this.passwordless.status(token);
      if (status === 'pending') return;

      this.stopEnrollPolling();

      if (status === 'approved') {
        this.pwdlessBusy.set(true);
        try {
          await this.passwordless.verifyActivate(token);
          this.pwdlessStatus.set('active');
          this.pwdlessDisplayNumber.set(null);
          this.enrollChallengeToken = null;
          this.pwdlessStatusMsg.set('Passwordless Telegram login is now active.');
        } catch {
          this.pwdlessError.set('Activation could not be completed.');
          this.pwdlessStatus.set('off');
          this.pwdlessDisplayNumber.set(null);
          this.enrollChallengeToken = null;
        } finally {
          this.pwdlessBusy.set(false);
        }
        return;
      }

      this.enrollChallengeToken = null;
      this.pwdlessDisplayNumber.set(null);
      this.pwdlessStatus.set('off');
      this.pwdlessError.set(
        status === 'denied'
          ? 'Activation denied. Wrong number tapped — try again.'
          : 'Activation test expired — try again.',
      );
    } catch {
      this.stopEnrollPolling();
      this.pwdlessError.set('Activation status check failed.');
    }
  }

  private stopEnrollPolling(): void {
    if (this.enrollPollTimer !== null) {
      clearInterval(this.enrollPollTimer);
      this.enrollPollTimer = null;
    }
  }

  async unlinkTelegram(): Promise<void> {
    if (!window.confirm('Unlink your Telegram account? You will stop receiving lobby notifications and lose auto-login from the mini-app.')) return;
    this.tgBusy.set(true);
    this.tgError.set(null);
    this.tgStatus.set(null);
    try {
      await this.account.unlinkTelegram();
      this.tgLinked.set(false);
      this.tgUsername.set(null);
      this.tgStatus.set('Telegram unlinked');
    } catch {
      this.tgError.set('Could not unlink Telegram.');
    } finally {
      this.tgBusy.set(false);
    }
  }

  async saveDisplayName(): Promise<void> {
    const name = this.displayNameDraft().trim();
    if (!name) {
      this.error.set('Username cannot be empty.');
      return;
    }
    this.savingName.set(true);
    this.error.set(null);
    this.status.set(null);
    try {
      const res = await this.account.setDisplayName(name);
      this.auth.patchUser({ displayName: res.displayName });
      this.displayNameDraft.set(res.displayName);
      this.status.set('Username saved');
    } catch {
      this.error.set('Username could not be saved.');
    } finally {
      this.savingName.set(false);
    }
  }

  async savePassword(): Promise<void> {
    const current = this.currentPassword();
    const next = this.newPassword();
    this.passwordError.set(null);
    this.passwordStatus.set(null);
    if (!current || !next) {
      this.passwordError.set('Enter your current and new password.');
      return;
    }
    if (next.length < 8) {
      this.passwordError.set('New password must be at least 8 characters.');
      return;
    }
    if (next !== this.confirmPassword()) {
      this.passwordError.set('New password and confirmation do not match.');
      return;
    }
    this.savingPassword.set(true);
    try {
      await this.account.changePassword(current, next);
      this.currentPassword.set('');
      this.newPassword.set('');
      this.confirmPassword.set('');
      this.passwordStatus.set('Password changed');
    } catch (err) {
      const message = err instanceof HttpErrorResponse && err.status === 401
        ? 'Current password is incorrect.'
        : err instanceof HttpErrorResponse && typeof err.error?.error === 'string'
          ? err.error.error
          : 'Password could not be changed.';
      this.passwordError.set(message);
    } finally {
      this.savingPassword.set(false);
    }
  }

  setDiagnosticsLogging(enabled: boolean): void {
    this.diagnosticsLogging.set(enabled);
    writeDiagnosticsLoggingEnabled(enabled);
  }

  async saveEmail(): Promise<void> {
    const email = this.newEmail().trim();
    const password = this.emailPassword();
    this.emailError.set(null);
    this.emailStatus.set(null);
    if (!email || !password) {
      this.emailError.set('Enter the new email and your current password.');
      return;
    }
    this.savingEmail.set(true);
    try {
      const res = await this.account.changeEmail(email, password);
      this.auth.patchUser({ email: res.email });
      this.newEmail.set('');
      this.emailPassword.set('');
      this.emailStatus.set('Email changed to ' + res.email);
    } catch (err) {
      const message = err instanceof HttpErrorResponse && err.status === 401
        ? 'Password is incorrect.'
        : err instanceof HttpErrorResponse && err.status === 409
          ? 'That email is already in use.'
          : err instanceof HttpErrorResponse && typeof err.error?.error === 'string'
            ? err.error.error
            : 'Email could not be changed.';
      this.emailError.set(message);
    } finally {
      this.savingEmail.set(false);
    }
  }
}
