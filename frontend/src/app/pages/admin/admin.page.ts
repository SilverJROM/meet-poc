import { HttpErrorResponse } from '@angular/common/http';
import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { personAddOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { AdminService, AdminUser } from '../../services/admin.service';

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

  readonly users = signal<AdminUser[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly email = signal('');
  readonly password = signal('');
  readonly displayName = signal('');
  readonly makeAdmin = signal(false);
  readonly creating = signal(false);
  readonly createError = signal<string | null>(null);
  readonly createdNotice = signal<string | null>(null);

  constructor() {
    addIcons({ personAddOutline, shieldCheckmarkOutline });
  }

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
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
}
