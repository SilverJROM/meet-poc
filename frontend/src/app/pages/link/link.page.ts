import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';

const PENDING_TOKEN_KEY = 'meet-poc.tg-link-token';

@Component({
  selector: 'app-link',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './link.page.html',
  styleUrl: './link.page.scss',
})
export class LinkPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly status = signal<'pending' | 'success' | 'error' | 'needs-login'>('pending');
  readonly message = signal<string>('Linking your Telegram account…');

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token')
      ?? sessionStorage.getItem(PENDING_TOKEN_KEY)
      ?? '';
    if (!token) {
      this.status.set('error');
      this.message.set('Missing link token. Send /link in the bot again to get a fresh URL.');
      return;
    }

    const user = await this.auth.ensureSession();
    if (!user) {
      sessionStorage.setItem(PENDING_TOKEN_KEY, token);
      this.status.set('needs-login');
      this.message.set('Sign in to finish linking your Telegram account.');
      await this.router.navigateByUrl(`/login?next=${encodeURIComponent('/app/link')}`);
      return;
    }

    try {
      await firstValueFrom(this.http.post('/api/telegram/link', { token }));
      sessionStorage.removeItem(PENDING_TOKEN_KEY);
      this.status.set('success');
      this.message.set(`Linked! Telegram is now tied to ${user.email}. You can return to the bot.`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      this.status.set('error');
      this.message.set(`Linking failed: ${detail}. Send /link again for a fresh token.`);
    }
  }
}
