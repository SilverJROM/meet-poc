import { Component, CUSTOM_ELEMENTS_SCHEMA, HostListener, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  chevronDownOutline,
  documentTextOutline,
  logOutOutline,
  peopleOutline,
  pulseOutline,
  radioOutline,
  recordingOutline,
  settingsOutline,
  timeOutline,
  videocamOutline,
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { filter } from 'rxjs';

type NavLink = { label: string; path: string; icon: string };
type NavGroup = { label: string; icon: string; path?: string; children?: NavLink[] };

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
  readonly currentUrl = signal(this.router.url);
  readonly openGroup = signal<string | null>(null);
  readonly userMenuOpen = signal(false);

  // Consensus rec #3: 4 core nav groups. Secondary pages live under Meetings/Library
  // dropdowns (links to existing routes — no new pages).
  private readonly baseNavGroups: NavGroup[] = [
    { label: 'Rooms', icon: 'videocam-outline', path: '/app/rooms' },
    {
      label: 'Meetings',
      icon: 'radio-outline',
      children: [
        { label: 'Ongoing', path: '/app/ongoing', icon: 'radio-outline' },
        { label: 'Past', path: '/app/past', icon: 'time-outline' },
      ],
    },
    {
      label: 'Library',
      icon: 'recording-outline',
      children: [
        { label: 'Recordings', path: '/app/recordings', icon: 'recording-outline' },
        { label: 'Transcripts', path: '/app/transcripts', icon: 'document-text-outline' },
        { label: 'Call diagnostics', path: '/app/diagnostics', icon: 'pulse-outline' },
      ],
    },
    { label: 'Settings', icon: 'settings-outline', path: '/app/settings' },
  ];

  readonly navGroups = computed<NavGroup[]>(() =>
    this.user()?.isAdmin
      ? [...this.baseNavGroups, { label: 'Admin', icon: 'people-outline', path: '/app/admin' }]
      : this.baseNavGroups,
  );

  readonly initials = computed<string>(() => {
    const email = this.user()?.email || '';
    const name = email.split('@')[0] || '';
    const parts = name.split(/[.\-_]+/).filter(Boolean);
    const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
    return (letters || '?').toUpperCase();
  });

  constructor() {
    addIcons({
      chevronDownOutline,
      documentTextOutline,
      logOutOutline,
      peopleOutline,
      pulseOutline,
      radioOutline,
      recordingOutline,
      settingsOutline,
      timeOutline,
      videocamOutline,
    });
    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd)).subscribe((event) => {
      this.currentUrl.set(event.urlAfterRedirects);
      this.closeMenus();
    });
  }

  isGroupActive(group: NavGroup): boolean {
    if (group.path) return this.currentUrl().startsWith(group.path);
    return (group.children || []).some((child) => this.currentUrl().startsWith(child.path));
  }

  toggleGroup(label: string, event: Event): void {
    event.stopPropagation();
    this.userMenuOpen.set(false);
    this.openGroup.set(this.openGroup() === label ? null : label);
  }

  toggleUserMenu(event: Event): void {
    event.stopPropagation();
    this.openGroup.set(null);
    this.userMenuOpen.set(!this.userMenuOpen());
  }

  closeMenus(): void {
    this.openGroup.set(null);
    this.userMenuOpen.set(false);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeMenus();
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
