import { HttpErrorResponse } from '@angular/common/http';
import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  createOutline,
  keyOutline,
  mailOutline,
  personAddOutline,
  shieldCheckmarkOutline,
  swapHorizontalOutline,
  trashOutline,
} from 'ionicons/icons';
import { AdminService, AdminUser } from '../../services/admin.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [FormsModule, DatePipe],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './admin.page.html',
  styleUrl: './admin.page.scss',
})
export class AdminPage implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);

  readonly users = signal<AdminUser[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly isSuperuser = signal(false);
  readonly rowBusy = signal<string | null>(null);
  readonly rowError = signal<string | null>(null);
  readonly confirmOpen = signal(false);
  readonly confirmMessage = signal('');
  private confirmResolver: ((accepted: boolean) => void) | null = null;

  readonly email = signal('');
  readonly password = signal('');
  readonly displayName = signal('');
  readonly makeAdmin = signal(false);
  readonly creating = signal(false);
  readonly createError = signal<string | null>(null);
  readonly createdNotice = signal<string | null>(null);

  readonly diagnosticsEnabled = signal(true);
  readonly diagnosticsError = signal<string | null>(null);

  constructor() {
    addIcons({
      personAddOutline,
      shieldCheckmarkOutline,
      trashOutline,
      swapHorizontalOutline,
      createOutline,
      mailOutline,
      keyOutline,
    });
  }

  ngOnInit(): void {
    void this.load();
    void this.loadDiagnosticsSetting();
  }

  async loadDiagnosticsSetting(): Promise<void> {
    this.diagnosticsError.set(null);
    try {
      this.diagnosticsEnabled.set(await this.admin.getDiagnosticsEnabled());
    } catch {
      this.diagnosticsError.set('Diagnostics setting could not be loaded.');
    }
  }

  async setDiagnosticsEnabled(enabled: boolean): Promise<void> {
    this.diagnosticsError.set(null);
    this.diagnosticsEnabled.set(enabled);
    try {
      this.diagnosticsEnabled.set(await this.admin.setDiagnosticsEnabled(enabled));
    } catch {
      this.diagnosticsError.set('Diagnostics setting could not be saved.');
      void this.loadDiagnosticsSetting();
    }
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const user = await this.auth.ensureSession();
      this.isSuperuser.set(user?.isSuperuser === true);
      this.users.set(await this.admin.listUsers());
    } catch {
      this.error.set('Users could not be loaded.');
    } finally {
      this.loading.set(false);
    }
  }

  async createUser(): Promise<void> {
    const email = this.email().trim();
    const password = this.password();
    this.createError.set(null);
    this.createdNotice.set(null);
    if (!email || !password) {
      this.createError.set('Email and initial password are required.');
      return;
    }
    if (password.length < 8) {
      this.createError.set('Initial password must be at least 8 characters.');
      return;
    }
    this.creating.set(true);
    try {
      const user = await this.admin.createUser({
        email,
        password,
        displayName: this.displayName().trim() || undefined,
        isAdmin: this.makeAdmin(),
      });
      this.createdNotice.set(`Created ${user.email}. Share the password you set — it is not stored in plain text and won't be shown again.`);
      this.email.set('');
      this.password.set('');
      this.displayName.set('');
      this.makeAdmin.set(false);
      await this.load();
    } catch (err) {
      const message = err instanceof HttpErrorResponse && err.status === 409
        ? 'That email is already in use.'
        : err instanceof HttpErrorResponse && typeof err.error?.error === 'string'
          ? err.error.error
          : 'User could not be created.';
      this.createError.set(message);
    } finally {
      this.creating.set(false);
    }
  }

  canActOn(user: AdminUser): boolean {
    return !user.protected;
  }

  async deleteUser(user: AdminUser): Promise<void> {
    if (!this.canActOn(user)) return;
    if (!(await this.askConfirm(`Delete ${user.email}? This cannot be undone.`))) return;
    await this.runRowAction(user.email, () => this.admin.deleteUser(user.email));
  }

  async toggleAdmin(user: AdminUser): Promise<void> {
    if (!this.canActOn(user)) return;
    const next = !user.isAdmin;
    const label = next ? 'grant admin access to' : 'remove admin access from';
    const prefix = this.isSuperuser() ? 'God mode: ' : '';
    if (!(await this.askConfirm(`${prefix}${label} ${user.email}?`))) return;
    await this.runRowAction(user.email, () => this.admin.setUserAdmin(user.email, next));
  }

  async editDisplayName(user: AdminUser): Promise<void> {
    if (!this.isSuperuser() || !this.canActOn(user)) return;
    const next = window.prompt(`New username for ${user.email}:`, user.displayName)?.trim();
    if (!next || next === user.displayName) return;
    if (!(await this.askConfirm(`Change username for ${user.email} to "${next}"?`))) return;
    await this.runRowAction(user.email, () => this.admin.setDisplayName(user.email, next));
  }

  async editEmail(user: AdminUser): Promise<void> {
    if (!this.isSuperuser() || !this.canActOn(user)) return;
    const next = window.prompt(`New email for ${user.email}:`, user.email)?.trim();
    if (!next || next === user.email) return;
    if (!(await this.askConfirm(`Change email from ${user.email} to ${next}? Linked data will be updated.`))) return;
    await this.runRowAction(user.email, () => this.admin.changeEmail(user.email, next));
  }

  async resetPassword(user: AdminUser): Promise<void> {
    if (!this.isSuperuser() || !this.canActOn(user)) return;
    const next = window.prompt(`New password for ${user.email} (min 8 chars):`);
    if (!next || next.length < 8) {
      if (next !== null) this.rowError.set('Password must be at least 8 characters.');
      return;
    }
    if (!(await this.askConfirm(`Reset password for ${user.email}?`))) return;
    await this.runRowAction(user.email, () => this.admin.resetPassword(user.email, next));
  }

  cancelConfirm(): void {
    this.confirmOpen.set(false);
    this.confirmResolver?.(false);
    this.confirmResolver = null;
  }

  acceptConfirm(): void {
    this.confirmOpen.set(false);
    this.confirmResolver?.(true);
    this.confirmResolver = null;
  }

  private askConfirm(message: string): Promise<boolean> {
    this.confirmMessage.set(message);
    this.confirmOpen.set(true);
    return new Promise((resolve) => {
      this.confirmResolver = resolve;
    });
  }

  private async runRowAction(email: string, action: () => Promise<void>): Promise<void> {
    this.rowBusy.set(email);
    this.rowError.set(null);
    try {
      await action();
      await this.load();
    } catch (err) {
      const message = err instanceof HttpErrorResponse && typeof err.error?.error === 'string'
        ? err.error.error
        : 'Action failed.';
      this.rowError.set(message);
    } finally {
      this.rowBusy.set(null);
    }
  }
}