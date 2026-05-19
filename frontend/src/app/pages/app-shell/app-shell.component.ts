import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  chevronBackOutline,
  chevronForwardOutline,
  documentTextOutline,
  logOutOutline,
  radioOutline,
  recordingOutline,
  settingsOutline,
  timeOutline,
  videocamOutline,
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { filter } from 'rxjs';

const SIDEBAR_STORAGE_KEY = 'meet-poc.sidebar-collapsed';

type NavItem = {
  label: string;
  path: string;
  icon: string;
};

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly collapsed = signal(this.readInitialCollapsed());
  readonly currentUrl = signal(this.router.url);
  readonly pageTitle = () => this.navItems.find((item) => this.currentUrl().startsWith(item.path))?.label || 'Rooms';

  readonly navItems: NavItem[] = [
    { label: 'Rooms', path: '/app/rooms', icon: 'videocam-outline' },
    { label: 'Ongoing meetings', path: '/app/ongoing', icon: 'radio-outline' },
    { label: 'Past meetings', path: '/app/past', icon: 'time-outline' },
    { label: 'Recordings', path: '/app/recordings', icon: 'recording-outline' },
    { label: 'Transcripts', path: '/app/transcripts', icon: 'document-text-outline' },
    { label: 'Settings', path: '/app/settings', icon: 'settings-outline' },
  ];

  constructor() {
    addIcons({
      chevronBackOutline,
      chevronForwardOutline,
      documentTextOutline,
      logOutOutline,
      radioOutline,
      recordingOutline,
      settingsOutline,
      timeOutline,
      videocamOutline,
    });
    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd)).subscribe((event) => {
      this.currentUrl.set(event.urlAfterRedirects);
    });
  }

  toggleSidebar(): void {
    const next = !this.collapsed();
    this.collapsed.set(next);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }

  private readInitialCollapsed(): boolean {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored == null ? true : stored === 'true';
  }
}
