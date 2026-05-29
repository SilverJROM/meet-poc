import { HttpErrorResponse } from '@angular/common/http';
import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { keyOutline, linkOutline, mailOutline, personOutline, saveOutline, unlinkOutline } from 'ionicons/icons';
import { AccountService } from '../../services/account.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-account-settings',
  standalone: true,
  imports: [FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './account-settings.component.html',
  styleUrl: './account-settings.component.scss',
})
export class AccountSettingsComponent implements OnInit {
  private readonly account = inject(AccountService);
  private readonly auth = inject(AuthService);

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

  constructor() {
    addIcons({ keyOutline, linkOutline, mailOutline, personOutline, saveOutline, unlinkOutline });
    const current = this.auth.user();
    this.displayNameDraft.set(current?.displayName ?? '');
  }

  ngOnInit(): void {
    void this.loadTelegram();
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
