import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  DEFAULT_ICE_SERVERS,
  decideIceConfigOutcome,
  iceServersFromConfigPayload,
  iceServersHaveTurn,
  ICE_CONFIG_FETCH_TIMEOUT_MS,
  ICE_CONFIG_MAX_ATTEMPTS,
  ICE_CONFIG_RETRY_BACKOFF_MS,
} from './ice-config-utils';

export {
  DEFAULT_ICE_SERVERS,
  decideIceConfigOutcome,
  iceServersFromConfigPayload,
  iceServersHaveTurn,
  ICE_CONFIG_FETCH_TIMEOUT_MS,
  ICE_CONFIG_MAX_ATTEMPTS,
  ICE_CONFIG_RETRY_BACKOFF_MS,
} from './ice-config-utils';

const ICE_CONFIG_CACHE_TTL_MS = 12 * 60 * 1000;
const TURN_HEALTH_TIMEOUT_MS = 5000;

export type TurnHealthResult = {
  status: 'reachable' | 'unavailable';
  checkedAt: number;
  elapsedMs: number;
  iceTransportPolicy: RTCIceTransportPolicy;
  candidateType: string | null;
  transport: string | null;
  error: string | null;
};

@Injectable({ providedIn: 'root' })
export class IceConfigService {
  private readonly http = inject(HttpClient);
  private cached: { iceServers: RTCIceServer[]; expiresAtMs: number } | null = null;
  private pending: Promise<RTCIceServer[]> | null = null;
  readonly lastFetchError = signal<string | null>(null);
  readonly relayUnavailable = signal(false);
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
      if (!iceServersHaveTurn(iceServers)) {
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
              iceTransportPolicy: 'relay',
              candidateType: 'relay',
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
    let lastError = 'ICE configuration request failed.';

    for (let attempt = 1; attempt <= ICE_CONFIG_MAX_ATTEMPTS; attempt += 1) {
      try {
        const config = await withTimeout(
          firstValueFrom(this.http.get<{ iceServers?: unknown }>('/api/ice-config')),
          ICE_CONFIG_FETCH_TIMEOUT_MS,
          '/api/ice-config',
        );
        const iceServers = iceServersFromConfigPayload(config);
        const outcome = decideIceConfigOutcome({
          fetchOk: true,
          hasUsableServers: iceServers.length > 0,
          attempt,
          maxAttempts: ICE_CONFIG_MAX_ATTEMPTS,
        });
        if (outcome === 'use') {
          this.relayUnavailable.set(false);
          this.lastFetchError.set(null);
          return iceServers;
        }
        lastError = 'ICE configuration did not include usable servers.';
        if (outcome === 'retry') {
          await sleep(ICE_CONFIG_RETRY_BACKOFF_MS[attempt - 1] ?? 0);
          continue;
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'ICE configuration request failed.';
        const outcome = decideIceConfigOutcome({
          fetchOk: false,
          hasUsableServers: false,
          attempt,
          maxAttempts: ICE_CONFIG_MAX_ATTEMPTS,
        });
        if (outcome === 'retry') {
          await sleep(ICE_CONFIG_RETRY_BACKOFF_MS[attempt - 1] ?? 0);
          continue;
        }
      }

      break;
    }

    this.relayUnavailable.set(true);
    this.lastFetchError.set(lastError);
    if (lastError.includes('timed out')) {
      console.warn('[ice-config] /api/ice-config timed out after retries - using explicit fallback STUN');
    } else {
      console.warn('[ice-config] failed to fetch usable /api/ice-config after retries; using explicit fallback STUN', lastError);
    }
    return DEFAULT_ICE_SERVERS.map((server) => ({ ...server }));
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
      iceTransportPolicy: 'relay',
      candidateType: null,
      transport,
      error,
    };
  }
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

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function closePeerConnection(pc: RTCPeerConnection | null): void {
  if (!pc) return;
  pc.onicecandidate = null;
  pc.onicegatheringstatechange = null;
  pc.close();
}
