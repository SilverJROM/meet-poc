import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PlatformService {
  readonly isIOS = signal(matchesUserAgent(/iPad|iPhone|iPod/) || isTouchMac());
  readonly isAndroid = signal(matchesUserAgent(/Android/));
  readonly isMobileUA = computed(() => this.isIOS() || this.isAndroid());
}

function matchesUserAgent(pattern: RegExp): boolean {
  return typeof navigator !== 'undefined' && pattern.test(navigator.userAgent);
}

function isTouchMac(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    /Macintosh/.test(navigator.userAgent) &&
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 1
  );
}
