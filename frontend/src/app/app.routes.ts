import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { noAuthGuard } from './guards/no-auth.guard';

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
      { path: 'recordings', loadComponent: () => import('./pages/recordings/recordings.page').then((m) => m.RecordingsPage) },
      { path: 'transcripts', loadComponent: () => import('./pages/transcripts/transcripts.page').then((m) => m.TranscriptsPage) },
      { path: 'settings', loadComponent: () => import('./pages/settings-stub/settings-stub.page').then((m) => m.SettingsStubPage) },
    ],
  },
  {
    path: 'room/:id',
    loadComponent: () => import('./pages/room/room.page').then((m) => m.RoomPage),
  },
  {
    path: 'join/:id',
    loadComponent: () => import('./pages/room/room.page').then((m) => m.RoomPage),
  },
  { path: '**', redirectTo: 'app/rooms' },
];
