import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

@Injectable({ providedIn: 'root' })
export class IceConfigService {
  private readonly http = inject(HttpClient);
  private cached: Promise<RTCIceServer[]> | null = null;
  readonly lastFetchError = signal<string | null>(null);

  getIceServers(): Promise<RTCIceServer[]> {
    this.cached ??= this.fetchIceServers();
    return this.cached;
  }

  private async fetchIceServers(): Promise<RTCIceServer[]> {
    try {
      const config = await firstValueFrom(this.http.get<{ iceServers?: RTCIceServer[] }>('/api/ice-config'));
      if (Array.isArray(config.iceServers) && config.iceServers.length > 0) {
        this.lastFetchError.set(null);
        return config.iceServers;
      }
      this.lastFetchError.set('ICE configuration did not include usable servers.');
    } catch (err) {
      this.lastFetchError.set(err instanceof Error ? err.message : 'ICE configuration request failed.');
      console.warn('[ice-config] failed to fetch /api/ice-config; using default STUN servers', err);
    }
    return DEFAULT_ICE_SERVERS;
  }
}
