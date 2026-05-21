import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
const ICE_CONFIG_CACHE_TTL_MS = 12 * 60 * 1000;
const TURN_HEALTH_TIMEOUT_MS = 5000;

export type TurnHealthResult = {
  status: 'reachable' | 'unavailable';
  checkedAt: number;
  elapsedMs: number;
  transport: string | null;
  error: string | null;
};

@Injectable({ providedIn: 'root' })
export class IceConfigService {
  private readonly http = inject(HttpClient);
  private cached: { iceServers: RTCIceServer[]; expiresAtMs: number } | null = null;
  private pending: Promise<RTCIceServer[]> | null = null;
  readonly lastFetchError = signal<string | null>(null);
  readonly lastTurnHealth = signal<TurnHealthResult | null>(null);
  readonly turnHealthInFlight = signal(false);

  getIceServers(options: { forceRefresh?: boolean } = {}): Promise<RTCIceServer[]> {
    if (!options.forceRefresh && this.cached && this.cached.expiresAtMs > Date.now()) return Promise.resolve(this.cached.iceServers);
    if (!options.forceRefresh && this.pending) return this.pending;
    return this.refreshIceServers();
  }

  forceRefresh(): Promise<RTCIceServer[]> {
    return this.getIceServers({ forceRefresh: true });
  }

  async checkTurnHealth(options: { timeoutMs?: number } = {}): Promise<TurnHealthResult> {
    if (this.turnHealthInFlight()) {
      return (
        this.lastTurnHealth() ??
        this.unavailableTurnHealth(Date.now(), Date.now(), 'TURN health check already running.', null)
      );
    }

    const startedAt = Date.now();
    this.turnHealthInFlight.set(true);
    let pc: RTCPeerConnection | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    try {
      const iceServers = await this.forceRefresh();
      if (!iceServers.some(hasTurnUrl)) {
        return this.setTurnHealth(this.unavailableTurnHealth(startedAt, Date.now(), 'ICE config does not include TURN servers.', null));
      }
      if (typeof RTCPeerConnection === 'undefined') {
        return this.setTurnHealth(this.unavailableTurnHealth(startedAt, Date.now(), 'RTCPeerConnection is unavailable in this browser.', null));
      }

      const result = await new Promise<TurnHealthResult>((resolve) => {
        let settled = false;
        const finish = (next: TurnHealthResult): void => {
          if (settled) return;
          settled = true;
          if (timeout) {
            clearTimeout(timeout);
            timeout = null;
          }
          resolve(next);
        };
        const finishUnavailable = (error: string, transport: string | null = null): void => {
          finish(this.unavailableTurnHealth(startedAt, Date.now(), error, transport));
        };

        timeout = setTimeout(() => finishUnavailable('Timed out waiting for a relay candidate.'), options.timeoutMs ?? TURN_HEALTH_TIMEOUT_MS);

        try {
          pc = new RTCPeerConnection({ iceServers, iceTransportPolicy: 'relay' });
          pc.onicecandidate = (event) => {
            if (!event.candidate) return;
            const candidate = event.candidate.toJSON();
            if (candidateTypeFromCandidateLine(candidate.candidate) !== 'relay') return;
            finish({
              status: 'reachable',
              checkedAt: Date.now(),
              elapsedMs: Date.now() - startedAt,
              transport: candidateProtocolFromCandidateLine(candidate.candidate),
              error: null,
            });
          };
          pc.onicegatheringstatechange = () => {
            if (pc?.iceGatheringState === 'complete') finishUnavailable('ICE gathering completed without a relay candidate.');
          };
          pc.createDataChannel('turn-health');
          pc
            .createOffer()
            .then((offer) => pc?.setLocalDescription(offer))
            .catch((err: unknown) => finishUnavailable(errorMessage(err, 'TURN health offer failed.')));
        } catch (err) {
          finishUnavailable(errorMessage(err, 'TURN health check failed.'));
        }
      });

      return this.setTurnHealth(result);
    } finally {
      if (timeout) clearTimeout(timeout);
      closePeerConnection(pc);
      this.turnHealthInFlight.set(false);
    }
  }

  private refreshIceServers(): Promise<RTCIceServer[]> {
    const request = this.fetchIceServers().then((iceServers) => {
      if (!this.lastFetchError()) this.cached = { iceServers, expiresAtMs: Date.now() + ICE_CONFIG_CACHE_TTL_MS };
      return iceServers;
    });
    this.pending = request;
    request.finally(() => {
      if (this.pending === request) this.pending = null;
    });
    return request;
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

  private setTurnHealth(result: TurnHealthResult): TurnHealthResult {
    this.lastTurnHealth.set(result);
    return result;
  }

  private unavailableTurnHealth(startedAt: number, checkedAt: number, error: string, transport: string | null): TurnHealthResult {
    return {
      status: 'unavailable',
      checkedAt,
      elapsedMs: checkedAt - startedAt,
      transport,
      error,
    };
  }
}

function hasTurnUrl(server: RTCIceServer): boolean {
  const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
  return urls.some((url) => typeof url === 'string' && url.toLowerCase().startsWith('turn'));
}

function candidateTypeFromCandidateLine(candidate: string | undefined): string | null {
  return candidate?.match(/(?:^|\s)typ\s+(\S+)/)?.[1] ?? null;
}

function candidateProtocolFromCandidateLine(candidate: string | undefined): string | null {
  return candidate?.match(/^candidate:\S+\s+\d+\s+(\S+)/i)?.[1]?.toLowerCase() ?? null;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function closePeerConnection(pc: RTCPeerConnection | null): void {
  if (!pc) return;
  pc.onicecandidate = null;
  pc.onicegatheringstatechange = null;
  pc.close();
}
