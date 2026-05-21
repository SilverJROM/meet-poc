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

export interface SubscribedTrackEntry {
  publisherClientId: string;
  trackName: string;
  kind: string;
  mid: string;
}

@Injectable({ providedIn: 'root' })
export class SfuClientService {
  private readonly http = inject(HttpClient);
  private readonly iceConfigService = inject(IceConfigService);

  readonly localPublishState = signal<LocalPublishState | null>(null);
  readonly remotePublishers = signal<Map<string, import('./sfu-roster-utils.js').RemotePublisher>>(new Map());
  readonly remoteStreams = signal<Map<string, MediaStream>>(new Map());
  readonly subscribedTracks = signal<Map<string, SubscribedTrackEntry>>(new Map());

  private pc: RTCPeerConnection | null = null;
  // Single serialized queue — all PC-mutating ops run through enqueue() (publish/subscribe/close/renegotiate)
  private opQueue: Promise<void> = Promise.resolve();

  private callerCreds: { clientKey: string; participantId: string; sessionId: string } | null = null;
  private subscribedClientIds = new Set<string>();
  private midToEntry = new Map<string, SubscribedTrackEntry>();

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

  subscribeIfNeeded(publisher: import('./sfu-roster-utils.js').RemotePublisher): void {
    // Skip self
    if (publisher.cfSessionId === this.localPublishState()?.cfSessionId) return;
    // Skip already-subscribed
    if (this.subscribedClientIds.has(publisher.clientId)) return;
    // Skip if no tracks to subscribe to
    if (!publisher.tracks.length) return;
    // Mark before enqueue to prevent double-subscribe
    this.subscribedClientIds.add(publisher.clientId);
    void this.enqueue(() => this.doSubscribe(publisher));
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
    this.tearDownPeerSubscription(clientId);
    const next = removeFromRoster(this.remotePublishers(), clientId);
    if (next !== this.remotePublishers()) this.remotePublishers.set(next);
  }

  private tearDownPeerSubscription(clientId: string): void {
    if (!this.subscribedClientIds.has(clientId)) return;

    const mids: string[] = [];
    const nextSubscribed = new Map(this.subscribedTracks());
    for (const [mid, entry] of nextSubscribed) {
      if (entry.publisherClientId === clientId) {
        mids.push(mid);
        nextSubscribed.delete(mid);
        this.midToEntry.delete(mid);
      }
    }
    this.subscribedTracks.set(nextSubscribed);

    const nextStreams = new Map(this.remoteStreams());
    nextStreams.delete(clientId);
    this.remoteStreams.set(nextStreams);

    this.subscribedClientIds.delete(clientId);

    if (mids.length > 0) {
      const creds = this.callerCreds;
      const cfSessionId = this.localPublishState()?.cfSessionId ?? '';
      if (creds && cfSessionId) {
        void this.enqueue(() => this.doClose(mids, creds, cfSessionId));
      }
    }
  }

  private async doClose(mids: string[], creds: { clientKey: string; participantId: string; sessionId: string }, cfSessionId: string): Promise<void> {
    await firstValueFrom(
      this.http.put('/api/sfu/tracks/close', {
        ...creds,
        cfSessionId,
        tracks: mids.map((mid) => ({ mid })),
      }),
    );
  }

  destroy(): void {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.callerCreds = null;
    this.subscribedClientIds.clear();
    this.midToEntry.clear();
    this.localPublishState.set(null);
    this.remotePublishers.set(new Map());
    this.remoteStreams.set(new Map());
    this.subscribedTracks.set(new Map());
  }

  private async doPublish(params: { clientKey: string; participantId: string; sessionId: string; localStream: MediaStream | null }): Promise<void> {
    const { clientKey, participantId, sessionId, localStream } = params;
    const epoch = Date.now();

    this.callerCreds = { clientKey, participantId, sessionId };
    this.localPublishState.set({ cfSessionId: '', status: 'publishing', tracks: [] });

    try {
      // ICE: CF STUN first + existing TURN creds as fallback
      const turnServers = await this.iceConfigService.getIceServers();
      const iceServers: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }, ...turnServers];
      this.pc = new RTCPeerConnection({ iceServers });

      // Set ontrack BEFORE any subscribe requests so no track event is missed
      this.pc.ontrack = (event) => {
        const mid = event.transceiver.mid;
        if (!mid) return;
        const entry = this.midToEntry.get(mid);
        if (!entry) return;
        const next = new Map(this.remoteStreams());
        let stream = next.get(entry.publisherClientId);
        if (!stream) {
          stream = new MediaStream();
          next.set(entry.publisherClientId, stream);
        }
        stream.addTrack(event.track);
        this.remoteStreams.set(next);
      };

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

  private async doSubscribe(publisher: import('./sfu-roster-utils.js').RemotePublisher): Promise<void> {
    const creds = this.callerCreds;
    const publishState = this.localPublishState();
    if (!creds || !publishState || publishState.status !== 'published' || !this.pc) return;

    const cfSessionId = publishState.cfSessionId;

    type CfTracksResponse = {
      requiresImmediateRenegotiation?: boolean;
      sessionDescription?: RTCSessionDescriptionInit;
      tracks?: { trackName: string; mid: string }[];
    };

    const res = await firstValueFrom(
      this.http.post<CfTracksResponse>('/api/sfu/tracks', {
        ...creds,
        cfSessionId,
        tracks: publisher.tracks.map((t) => ({
          location: 'remote',
          sessionId: publisher.cfSessionId,
          trackName: t.trackName,
        })),
      }),
    );

    // Map mid → entry using the CF response, update subscribedTracks signal
    const responseTracks = res.tracks ?? [];
    const nextSubscribed = new Map(this.subscribedTracks());
    for (const rt of responseTracks) {
      const kind = publisher.tracks.find((t) => t.trackName === rt.trackName)?.kind ?? 'unknown';
      const entry: SubscribedTrackEntry = {
        publisherClientId: publisher.clientId,
        trackName: rt.trackName,
        kind,
        mid: rt.mid,
      };
      this.midToEntry.set(rt.mid, entry);
      nextSubscribed.set(rt.mid, entry);
    }
    this.subscribedTracks.set(nextSubscribed);

    // Full renegotiation inside this enqueue op — must not interleave with other ops
    if (res.requiresImmediateRenegotiation && res.sessionDescription) {
      await this.pc.setRemoteDescription(res.sessionDescription);
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      await firstValueFrom(
        this.http.put('/api/sfu/renegotiate', {
          ...creds,
          cfSessionId,
          sessionDescription: { type: this.pc.localDescription!.type, sdp: this.pc.localDescription!.sdp },
        }),
      );
    }
  }
}
