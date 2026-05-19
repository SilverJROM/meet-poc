import { Injectable, OnDestroy, signal } from '@angular/core';

const MOBILE_MAX_WIDTH = 1023;
const RESIZE_THROTTLE_MS = 250;

@Injectable({ providedIn: 'root' })
export class ViewportService implements OnDestroy {
  readonly isMobile = signal(readIsMobile());

  private resizeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('resize', this.onResize, { passive: true });
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') window.removeEventListener('resize', this.onResize);
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
  }

  private readonly onResize = (): void => {
    if (this.resizeTimer) return;
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = null;
      this.isMobile.set(readIsMobile());
    }, RESIZE_THROTTLE_MS);
  };
}

function readIsMobile(): boolean {
  return typeof window !== 'undefined' && window.innerWidth <= MOBILE_MAX_WIDTH;
}
