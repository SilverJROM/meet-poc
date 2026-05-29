import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { noAuthGuard } from './guards/no-auth.guard';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'app/rooms' },
  { path: 'dashboard', redirectTo: 'app/rooms' },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
    canActivate: [noAuthGuard],
  },
  {
    path: 'app',
    loadComponent: () => import('./pages/app-shell/app-shell.component').then((m) => m.AppShellComponent),
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'rooms' },
      { path: 'rooms', loadComponent: () => import('./pages/rooms/rooms.page').then((m) => m.RoomsPage) },
      { path: 'ongoing', loadComponent: () => import('./pages/ongoing/ongoing.page').then((m) => m.OngoingPage) },
      { path: 'past', loadComponent: () => import('./pages/past/past.page').then((m) => m.PastPage) },
      { path: 'diagnostics', loadComponent: () => import('./pages/diagnostics/diagnostics.page').then((m) => m.DiagnosticsPage) },
      { path: 'recordings', loadComponent: () => import('./pages/recordings/recordings.page').then((m) => m.RecordingsPage) },
      { path: 'transcripts', loadComponent: () => import('./pages/transcripts/transcripts.page').then((m) => m.TranscriptsPage) },
      { path: 'settings', loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage) },
      { path: 'admin', loadComponent: () => import('./pages/admin/admin.page').then((m) => m.AdminPage), canActivate: [adminGuard] },
      { path: 'link', loadComponent: () => import('./pages/link/link.page').then((m) => m.LinkPage) },
    ],
  },
  {
    path: 'room/:slug',
    loadComponent: () => import('./pages/room/room.page').then((m) => m.RoomPage),
  },
  {
    path: 'join',
    loadComponent: () => import('./pages/join/join.page').then((m) => m.JoinPage),
  },
  {
    path: 'join/:slug',
    loadComponent: () => import('./pages/room/room.page').then((m) => m.RoomPage),
  },
  { path: '**', redirectTo: 'app/rooms' },
];
