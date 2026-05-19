import { Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';
import { PlatformService } from './services/platform.service';
import { ViewportService } from './services/viewport.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class AppComponent {
  private readonly auth = inject(AuthService);
  private readonly platform = inject(PlatformService);
  private readonly viewport = inject(ViewportService);

  constructor() {
    void this.auth.checkSession();
    effect(() => {
      window.__meetDebug = {
        ...window.__meetDebug,
        localStream: window.__meetDebug?.localStream ?? null,
        peers: window.__meetDebug?.peers ?? [],
        screenShareAttempts: window.__meetDebug?.screenShareAttempts ?? 0,
        isRecording: window.__meetDebug?.isRecording ?? false,
        isMobile: () => this.viewport.isMobile(),
        isIOS: () => this.platform.isIOS(),
        isAndroid: () => this.platform.isAndroid(),
      };
    });
  }
}
