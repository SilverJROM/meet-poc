import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { IceConfigService } from './ice-config.service';
import { applyPresenceUpdate, applyRosterSnapshot, removeFromRoster } from './sfu-roster-utils.js';
export type { RemotePublisher } from './sfu-roster-utils.js';

export interface SfuTrackModel {
  trackName: string;
  kind: string;
  mid: string;
  status: 'live' | 'closed';
}

export interface LocalPublishState {
  cfSessionId: string;
  status: 'publishing' | 'published' | 'error';
  tracks: SfuTrackModel[];
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class SfuClientService {
  private readonly http = inject(HttpClient);
  private readonly iceConfigService = inject(IceConfigService);

  readonly localPublishState = signal<LocalPublishState | null>(null);
  readonly remotePublishers = signal<Map<string, import('./sfu-roster-utils.js').RemotePublisher>>(new Map());

  private pc: RTCPeerConnection | null = null;
  // Single serialized queue — all PC-mutating ops run through enqueue() (subscribe/close/update in later batches)
  private opQueue: Promise<void> = Promise.resolve();

  enqueue<T>(op: () => Promise<T>): Promise<T> {
    const result = this.opQueue.then(() => op());
    this.opQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  publish(params: { clientKey: string; participantId: string; sessionId: string; localStream: MediaStream | null }): Promise<void> {
    return this.enqueue(() => this.doPublish(params));
  }

  getStats(): Promise<RTCStatsReport | null> {
    return this.pc ? this.pc.getStats() : Promise.resolve(null);
  }

  handleSfuPresence(msg: { clientId: string; participantId: string; cfSessionId: string; tracks: { trackName: string; kind: string }[]; revision: number }): void {
    const next = applyPresenceUpdate(this.remotePublishers(), msg);
    if (next !== this.remotePublishers()) this.remotePublishers.set(next);
  }

  handleSfuRoster(publishers: { clientId: string; participantId: string; cfSessionId: string; tracks: { trackName: string; kind: string }[]; revision: number }[]): void {
    this.remotePublishers.set(applyRosterSnapshot(publishers));
  }

  removePeer(clientId: string): void {
    const next = removeFromRoster(this.remotePublishers(), clientId);
    if (next !== this.remotePublishers()) this.remotePublishers.set(next);
  }

  destroy(): void {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.localPublishState.set(null);
    this.remotePublishers.set(new Map());
  }

  private async doPublish(params: { clientKey: string; participantId: string; sessionId: string; localStream: MediaStream | null }): Promise<void> {
    const { clientKey, participantId, sessionId, localStream } = params;
    const epoch = Date.now();

    this.localPublishState.set({ cfSessionId: '', status: 'publishing', tracks: [] });

    try {
      // ICE: CF STUN first + existing TURN creds as fallback
      const turnServers = await this.iceConfigService.getIceServers();
      const iceServers: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }, ...turnServers];
      this.pc = new RTCPeerConnection({ iceServers });

      // Add local tracks with pre-negotiated video transceiver (DR-55/F2: always negotiate video up-front)
      const audioTrack = localStream?.getAudioTracks()[0];
      if (audioTrack) {
        this.pc.addTransceiver(audioTrack, { direction: 'sendrecv' });
      } else {
        this.pc.addTransceiver('audio', { direction: 'sendrecv' });
      }
      const videoTrack = localStream?.getVideoTracks()[0];
      if (videoTrack) {
        this.pc.addTransceiver(videoTrack, { direction: 'sendrecv' });
      } else {
        // Camera off: pre-negotiate so replaceTrack works later without renegotiation
        this.pc.addTransceiver('video', { direction: 'sendrecv' });
      }

      // createOffer → setLocalDescription (mids assigned after SLD)
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      // POST /api/sfu/session → cfSessionId
      const sessionRes = await firstValueFrom(
        this.http.post<{ sessionId: string }>('/api/sfu/session', { clientKey, participantId, sessionId }),
      );
      const cfSessionId = sessionRes.sessionId;

      // Build track params for transceivers that have a live sender track
      const trackParams = this.pc
        .getTransceivers()
        .filter((t) => t.mid !== null && t.sender.track !== null)
        .map((t) => {
          const kind = t.sender.track!.kind;
          const trackName = `${participantId}:${epoch}:${kind}:${crypto.randomUUID()}`;
          return { location: 'local' as const, mid: t.mid!, trackName, kind };
        });

      // POST /api/sfu/tracks → answer SDP (must include the offer SDP for CF to produce an answer)
      const tracksRes = await firstValueFrom(
        this.http.post<{ sessionDescription: RTCSessionDescriptionInit }>('/api/sfu/tracks', {
          clientKey,
          participantId,
          sessionId,
          cfSessionId,
          sessionDescription: { type: this.pc.localDescription!.type, sdp: this.pc.localDescription!.sdp },
          tracks: trackParams.map(({ location, mid, trackName }) => ({ location, mid, trackName })),
        }),
      );

      // setRemoteDescription with CF answer
      await this.pc.setRemoteDescription(tracksRes.sessionDescription);

      // Persist mid model for close/update in later batches
      const tracks: SfuTrackModel[] = trackParams.map(({ trackName, kind, mid }) => ({
        trackName,
        kind,
        mid,
        status: 'live',
      }));
      this.localPublishState.set({ cfSessionId, status: 'published', tracks });
    } catch (err) {
      this.localPublishState.set({ cfSessionId: '', status: 'error', tracks: [], error: String(err) });
      throw err;
    }
  }
}
