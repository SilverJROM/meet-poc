import assert from 'node:assert/strict';
import '@angular/compiler';
import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { createEnvironmentInjector, runInInjectionContext, type EnvironmentInjector } from '@angular/core';
import { SfuClientService } from './sfu-client.service.js';
import { IceConfigService } from './ice-config.service.js';
import { ViewportService } from './viewport.service.js';
import {
  applyPresenceUpdate,
  applyRosterSnapshot,
  planInitialPublishRetry,
  planSfuTransportRecovery,
  planSubscribeRetry,
  removeFromRoster,
  selectNewRemoteTracks,
  shouldRegisterFirstAddedLocalTrack,
} from './sfu-roster-utils.js';
import type { RemotePublisher } from './sfu-roster-utils.js';
import { reconcileSubscribedMids } from './sfu-mid-reconcile.js';
import type { SubscribedTrackEntry } from './sfu-client.service.js';

function makePublisher(clientId: string, revision: number): RemotePublisher {
  return { clientId, participantId: `p-${clientId}`, cfSessionId: `cf-${clientId}`, tracks: [], revision };
}

function makeTransceivers(entries: { mid: string; receiverKind: string }[]): RTCRtpTransceiver[] {
  return entries.map((entry) => ({ mid: entry.mid, receiver: { track: { kind: entry.receiverKind } } })) as unknown as RTCRtpTransceiver[];
}

function statsReportOf(...entries: Array<Record<string, unknown> & { id: string }>): RTCStatsReport {
  return new Map(entries.map((entry) => [entry.id, entry])) as unknown as RTCStatsReport;
}

type IceConfigDouble = {
  getIceServers?: () => Promise<RTCIceServer[]>;
  forceRefresh?: () => Promise<RTCIceServer[]>;
  relayUnavailable?: () => boolean;
};

function createSfuClient(http: Partial<HttpClient> = {}, iceConfig: IceConfigDouble = {}): SfuClientService {
  const injector = createEnvironmentInjector(
    [
      { provide: HttpClient, useValue: http },
      {
        provide: IceConfigService,
        useValue: {
          getIceServers: async () => [],
          forceRefresh: async () => [],
          relayUnavailable: () => false,
          ...iceConfig,
        },
      },
      { provide: ViewportService, useValue: { isMobile: () => false } },
    ],
    undefined as unknown as EnvironmentInjector,
  );
  return runInInjectionContext(injector, () => new SfuClientService());
}

type FakeTimer = { id: number; active: boolean; callback: () => void };

function withFakeTimers(run: (timers: FakeTimer[]) => void): void {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timers: FakeTimer[] = [];
  Object.defineProperty(globalThis, 'setTimeout', {
    configurable: true,
    value: (callback: () => void) => {
      const timer = { id: timers.length + 1, active: true, callback };
      timers.push(timer);
      return timer.id;
    },
  });
  Object.defineProperty(globalThis, 'clearTimeout', {
    configurable: true,
    value: (id: number) => {
      const timer = timers.find((entry) => entry.id === id);
      if (timer) timer.active = false;
    },
  });
  try {
    run(timers);
  } finally {
    Object.defineProperty(globalThis, 'setTimeout', { configurable: true, value: originalSetTimeout });
    Object.defineProperty(globalThis, 'clearTimeout', { configurable: true, value: originalClearTimeout });
  }
}

async function withFakeTimersAsync(run: (timers: FakeTimer[]) => Promise<void>): Promise<void> {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timers: FakeTimer[] = [];
  Object.defineProperty(globalThis, 'setTimeout', {
    configurable: true,
    value: (callback: () => void) => {
      const timer = { id: timers.length + 1, active: true, callback };
      timers.push(timer);
      return timer.id;
    },
  });
  Object.defineProperty(globalThis, 'clearTimeout', {
    configurable: true,
    value: (id: number) => {
      const timer = timers.find((entry) => entry.id === id);
      if (timer) timer.active = false;
    },
  });
  try {
    await run(timers);
  } finally {
    Object.defineProperty(globalThis, 'setTimeout', { configurable: true, value: originalSetTimeout });
    Object.defineProperty(globalThis, 'clearTimeout', { configurable: true, value: originalClearTimeout });
  }
}

function makeSubscribePc(options: { renegotiateFails: boolean }): RTCPeerConnection & { rollbackCount: number } {
  const existingTransceivers = [
    { mid: '0', receiver: { track: { kind: 'audio' } } },
    { mid: '1', receiver: { track: { kind: 'video' } } },
  ];
  const subscribedTransceivers = [
    ...existingTransceivers,
    { mid: '2', receiver: { track: { kind: 'audio' } } },
    { mid: '3', receiver: { track: { kind: 'video' } } },
  ];
  const pc = {
    rollbackCount: 0,
    remoteSet: false,
    signalingState: 'stable',
    localDescription: null as RTCSessionDescriptionInit | null,
    getTransceivers(): RTCRtpTransceiver[] {
      return (this.remoteSet ? subscribedTransceivers : existingTransceivers) as unknown as RTCRtpTransceiver[];
    },
    async setRemoteDescription(): Promise<void> {
      this.remoteSet = true;
    },
    async createAnswer(): Promise<RTCSessionDescriptionInit> {
      return { type: 'answer', sdp: 'answer-sdp' };
    },
    async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
      if (desc.type === 'rollback') {
        this.rollbackCount += 1;
        this.signalingState = 'stable';
        this.localDescription = null;
        return;
      }
      this.localDescription = desc;
      this.signalingState = options.renegotiateFails ? 'have-local-offer' : 'stable';
    },
  };
  return pc as unknown as RTCPeerConnection & { rollbackCount: number };
}

function makeSingleTrackSubscribePc(): RTCPeerConnection & { rollbackCount: number; transceiverCount: () => number } {
  const transceivers = [{ mid: '0', receiver: { track: { kind: 'audio' } } }];
  const pc = {
    rollbackCount: 0,
    signalingState: 'stable',
    localDescription: null as RTCSessionDescriptionInit | null,
    getTransceivers(): RTCRtpTransceiver[] {
      return transceivers as unknown as RTCRtpTransceiver[];
    },
    async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
      if (desc.type === 'rollback') {
        this.signalingState = 'stable';
        return;
      }
      transceivers.push({ mid: String(transceivers.length), receiver: { track: { kind: 'audio' } } });
    },
    async createAnswer(): Promise<RTCSessionDescriptionInit> {
      return { type: 'answer', sdp: 'answer-sdp' };
    },
    async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
      if (desc.type === 'rollback') {
        this.rollbackCount += 1;
        this.signalingState = 'stable';
        this.localDescription = null;
        return;
      }
      this.localDescription = desc;
      this.signalingState = 'stable';
    },
    transceiverCount(): number {
      return transceivers.length;
    },
    close(): void {},
  };
  return pc as unknown as RTCPeerConnection & { rollbackCount: number; transceiverCount: () => number };
}

function installPublishedSfuState(sfu: SfuClientService, pc: RTCPeerConnection): void {
  const privateSfu = sfu as unknown as {
    pc: RTCPeerConnection;
    callerCreds: { clientKey: string; participantId: string; sessionId: string };
  };
  privateSfu.pc = pc;
  privateSfu.callerCreds = { clientKey: 'ck', participantId: 'local-p', sessionId: 'room-1' };
  sfu.localPublishState.set({ cfSessionId: 'local-cf', status: 'published', tracks: [] });
}

async function flushSfuQueue(sfu: SfuClientService): Promise<void> {
  const privateSfu = sfu as unknown as { opQueue: Promise<void> };
  await privateSfu.opQueue;
  await Promise.resolve();
  await privateSfu.opQueue;
  await Promise.resolve();
}

async function withFakeMediaStream(run: () => Promise<void>): Promise<void> {
  const originalMediaStream = globalThis.MediaStream;
  class FakeMediaStream {
    tracks: MediaStreamTrack[] = [];
    addTrack(track: MediaStreamTrack): void {
      this.tracks.push(track);
    }
    getTracks(): MediaStreamTrack[] {
      return this.tracks;
    }
  }

  Object.defineProperty(globalThis, 'MediaStream', { configurable: true, value: FakeMediaStream });
  try {
    await run();
  } finally {
    Object.defineProperty(globalThis, 'MediaStream', { configurable: true, value: originalMediaStream });
  }
}

async function withPublishPeerConnectionRecorder(run: (configs: RTCConfiguration[]) => Promise<void>): Promise<RTCConfiguration[]> {
  const originalPeerConnection = globalThis.RTCPeerConnection;
  const configs: RTCConfiguration[] = [];

  const makePublishPc = (): RTCPeerConnection => {
    const transceivers: RTCRtpTransceiver[] = [];
    const pc = {
      connectionState: 'new',
      iceConnectionState: 'new',
      signalingState: 'stable',
      localDescription: null as RTCSessionDescriptionInit | null,
      oniceconnectionstatechange: null,
      onconnectionstatechange: null,
      ontrack: null,
      addTransceiver(trackOrKind: MediaStreamTrack | string): RTCRtpTransceiver {
        const track = typeof trackOrKind === 'string' ? null : trackOrKind;
        const transceiver = {
          mid: String(transceivers.length),
          sender: { track },
          receiver: { track: { kind: typeof trackOrKind === 'string' ? trackOrKind : trackOrKind.kind } },
        } as unknown as RTCRtpTransceiver;
        transceivers.push(transceiver);
        return transceiver;
      },
      async createOffer(): Promise<RTCSessionDescriptionInit> {
        return { type: 'offer', sdp: 'offer-sdp' };
      },
      async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
        this.localDescription = desc;
      },
      async setRemoteDescription(): Promise<void> {},
      getTransceivers(): RTCRtpTransceiver[] {
        return transceivers;
      },
      close(): void {},
    };
    return pc as unknown as RTCPeerConnection;
  };

  const FakePeerConnection = function (this: RTCPeerConnection, config?: RTCConfiguration) {
    configs.push(config ?? {});
    return makePublishPc();
  } as unknown as typeof RTCPeerConnection;

  Object.defineProperty(globalThis, 'RTCPeerConnection', { configurable: true, value: FakePeerConnection });
  try {
    await run(configs);
  } finally {
    Object.defineProperty(globalThis, 'RTCPeerConnection', { configurable: true, value: originalPeerConnection });
  }

  return configs;
}

async function runFullRepublishRecovery(iceConfig: IceConfigDouble): Promise<RTCConfiguration[]> {
  const http = {
    post: (url: string) => {
      if (url === '/api/sfu/session') return of({ sessionId: 'cf-session' });
      if (url === '/api/sfu/tracks') return of({ sessionDescription: { type: 'answer', sdp: 'answer-sdp' } });
      throw new Error(`unexpected POST ${url}`);
    },
  } as unknown as Partial<HttpClient>;
  const sfu = createSfuClient(http, iceConfig);
  sfu.setTransportRecoveryHandler(() => sfu.publish({ clientKey: 'ck', participantId: 'local-p', sessionId: 'room-1', localStream: null }));
  const privateSfu = sfu as unknown as { recoverTransport: (reason: string) => Promise<void> };

  return withPublishPeerConnectionRecorder(() => privateSfu.recoverTransport('failed'));
}

async function collectDiagnosticsFromStats(stats: RTCStatsReport): Promise<{ diagnostics: Awaited<ReturnType<SfuClientService['collectDiagnostics']>>; getStatsCalls: number }> {
  const sfu = createSfuClient();
  let getStatsCalls = 0;
  const pc = {
    connectionState: 'connected',
    iceConnectionState: 'connected',
    async getStats(): Promise<RTCStatsReport> {
      getStatsCalls += 1;
      return stats;
    },
  } as unknown as RTCPeerConnection;
  const privateSfu = sfu as unknown as {
    pc: RTCPeerConnection;
    callerCreds: { clientKey: string; participantId: string; sessionId: string };
    midToEntry: Map<string, SubscribedTrackEntry>;
  };
  privateSfu.pc = pc;
  privateSfu.callerCreds = { clientKey: 'ck', participantId: 'local-p', sessionId: 'room-1' };
  privateSfu.midToEntry.set('1', { publisherClientId: 'remote-a', trackName: 'remote-audio', kind: 'audio', mid: '1' });
  privateSfu.midToEntry.set('2', { publisherClientId: 'remote-v', trackName: 'remote-video', kind: 'video', mid: '2' });
  sfu.localPublishState.set({
    cfSessionId: 'cf-local',
    status: 'published',
    tracks: [
      { trackName: 'local-audio', kind: 'audio', mid: '0', status: 'live' },
      { trackName: 'local-video', kind: 'video', mid: '3', status: 'live' },
    ],
  });
  const diagnostics = await sfu.collectDiagnostics();
  return { diagnostics, getStatsCalls };
}

// applyPresenceUpdate — applies a newer revision
{
  const empty = new Map<string, RemotePublisher>();
  const update = makePublisher('alice', 1);
  const next = applyPresenceUpdate(empty, update);
  assert.notEqual(next, empty, 'should return a new map when adding new entry');
  assert.deepEqual(next.get('alice'), update, 'entry should be stored');
}

// applyPresenceUpdate — rejects an equal revision (stale)
{
  const initial = new Map([['alice', makePublisher('alice', 5)]]);
  const stale = makePublisher('alice', 5);
  stale.cfSessionId = 'cf-stale';
  const next = applyPresenceUpdate(initial, stale);
  assert.equal(next, initial, 'should return the same map for equal revision (no change)');
  assert.equal(next.get('alice')?.cfSessionId, 'cf-alice', 'stale entry must not overwrite current');
}

// applyPresenceUpdate — rejects an older revision (stale)
{
  const initial = new Map([['alice', makePublisher('alice', 10)]]);
  const older = makePublisher('alice', 7);
  const next = applyPresenceUpdate(initial, older);
  assert.equal(next, initial, 'should return the same map for older revision');
  assert.equal(next.get('alice')?.revision, 10, 'revision must not regress');
}

// applyPresenceUpdate — applies a strictly newer revision
{
  const initial = new Map([['alice', makePublisher('alice', 3)]]);
  const newer = { ...makePublisher('alice', 4), cfSessionId: 'cf-alice-new' };
  const next = applyPresenceUpdate(initial, newer);
  assert.notEqual(next, initial, 'should return a new map for newer revision');
  assert.equal(next.get('alice')?.revision, 4, 'revision should be updated');
  assert.equal(next.get('alice')?.cfSessionId, 'cf-alice-new', 'entry should be updated');
}

// applyRosterSnapshot — replaces the map entirely
{
  const initial = new Map([['alice', makePublisher('alice', 1)]]);
  const snapshot = [makePublisher('bob', 2), makePublisher('carol', 3)];
  const next = applyRosterSnapshot(snapshot);
  assert.equal(next.has('alice'), false, 'old entries should not carry over');
  assert.equal(next.has('bob'), true);
  assert.equal(next.has('carol'), true);
  assert.equal(next.get('bob')?.revision, 2);
}

// applyRosterSnapshot — empty snapshot produces empty map
{
  const next = applyRosterSnapshot([]);
  assert.equal(next.size, 0);
}

// removeFromRoster — deletes an existing entry
{
  const initial = new Map([['alice', makePublisher('alice', 1)], ['bob', makePublisher('bob', 2)]]);
  const next = removeFromRoster(initial, 'alice');
  assert.notEqual(next, initial, 'should return a new map when deleting');
  assert.equal(next.has('alice'), false, 'alice should be removed');
  assert.equal(next.has('bob'), true, 'bob should remain');
}

// removeFromRoster — no-op for unknown clientId (same map reference)
{
  const initial = new Map([['alice', makePublisher('alice', 1)]]);
  const next = removeFromRoster(initial, 'nobody');
  assert.equal(next, initial, 'should return the same map when entry does not exist');
}

// shouldRegisterFirstAddedLocalTrack — late video after camera-off join registers once
{
  const tracks = [{ trackName: 'p1:1:audio:a1', kind: 'audio', mid: '0', status: 'live' as const }];
  assert.equal(shouldRegisterFirstAddedLocalTrack(tracks, 'video', true), true, 'first live video must register');
}

// shouldRegisterFirstAddedLocalTrack — late audio after publishing without mic registers once
{
  const tracks = [{ trackName: 'p1:1:video:v1', kind: 'video', mid: '1', status: 'live' as const }];
  assert.equal(shouldRegisterFirstAddedLocalTrack(tracks, 'audio', true), true, 'first live audio must register');
}

// shouldRegisterFirstAddedLocalTrack — normal on-join replacements do not re-register
{
  const tracks = [
    { trackName: 'p1:1:audio:a1', kind: 'audio', mid: '0', status: 'live' as const },
    { trackName: 'p1:1:video:v1', kind: 'video', mid: '1', status: 'live' as const },
  ];
  assert.equal(shouldRegisterFirstAddedLocalTrack(tracks, 'audio', true), false, 'existing live audio must not re-register');
  assert.equal(shouldRegisterFirstAddedLocalTrack(tracks, 'video', true), false, 'existing live video must not re-register');
}

// shouldRegisterFirstAddedLocalTrack — null sender tracks never register
{
  assert.equal(shouldRegisterFirstAddedLocalTrack([], 'audio', false), false, 'null audio sender must not register');
  assert.equal(shouldRegisterFirstAddedLocalTrack([], 'video', false), false, 'null video sender must not register');
}

// planSubscribeRetry — stuck subscribe with no first frame retries with bounded backoff
{
  const retry = planSubscribeRetry({ currentAttempts: 0, cap: 7, hasFirstFrame: false, baseBackoffMs: 250, maxBackoffMs: 4000 });
  assert.equal(retry.shouldRetry, true, 'stuck subscribe should retry when no first frame arrived');
  assert.equal(retry.nextAttempts, 1, 'first stuck retry should record attempt 1');
  assert.equal(retry.backoffMs, 250, 'first stuck retry should use base backoff');
  assert.equal(retry.capped, false, 'first stuck retry should not be capped');
}

// planSubscribeRetry — cap is respected at the final allowed retry
{
  const retry = planSubscribeRetry({ currentAttempts: 6, cap: 7, hasFirstFrame: false, baseBackoffMs: 250, maxBackoffMs: 4000 });
  assert.equal(retry.shouldRetry, true, 'attempt 7 is the last allowed retry');
  assert.equal(retry.nextAttempts, 7, 'attempt count should advance to the cap');
  assert.equal(retry.backoffMs, 4000, 'backoff should be capped at maxBackoffMs');
}

// planSubscribeRetry — healthy first-frame path does not retry
{
  const retry = planSubscribeRetry({ currentAttempts: 3, cap: 7, hasFirstFrame: true, baseBackoffMs: 250, maxBackoffMs: 4000 });
  assert.equal(retry.shouldRetry, false, 'healthy first frame must not schedule retry');
  assert.equal(retry.nextAttempts, 3, 'healthy path must not increment retry attempts');
  assert.equal(retry.backoffMs, null, 'healthy path has no backoff');
  assert.equal(retry.reason, 'healthy', 'healthy path should be identified explicitly');
}

// planSubscribeRetry — capped subscribe does not retry or create a storm
{
  const retry = planSubscribeRetry({ currentAttempts: 7, cap: 7, hasFirstFrame: false, baseBackoffMs: 250, maxBackoffMs: 4000 });
  assert.equal(retry.shouldRetry, false, 'capped subscribe must stop retrying');
  assert.equal(retry.nextAttempts, 8, 'capped attempt should still be recorded for logging');
  assert.equal(retry.backoffMs, null, 'capped subscribe must not schedule a backoff');
  assert.equal(retry.capped, true, 'capped subscribe should report capped');
}

// LEAK4 — tracked subscribe backoff timers are cleared in every subscribe-teardown path and cannot fire after cleanup.
{
  withFakeTimers((timers) => {
    for (const methodName of ['clearLocalTransportSessionState', 'closeLiveTracksForExit', 'destroy'] as const) {
      const sfu = createSfuClient();
      const privateSfu = sfu as unknown as {
        scheduleSubscribeRetryBackoff: (backoffMs: number) => void;
        subscribeBackoffTimers: Set<unknown>;
        clearLocalTransportSessionState: () => void;
        closeLiveTracksForExit: () => void;
        destroy: () => void;
      };
      const beforeScheduleCount = timers.length;
      privateSfu.scheduleSubscribeRetryBackoff(250);
      privateSfu.scheduleSubscribeRetryBackoff(500);
      assert.equal(privateSfu.subscribeBackoffTimers.size, 2, `${methodName} setup tracks two pending retry backoffs`);

      privateSfu[methodName]();

      assert.equal(privateSfu.subscribeBackoffTimers.size, 0, `${methodName} clears all pending retry backoffs`);
      const versionAfterCleanup = sfu.subscribeRetryVersion();
      for (const timer of timers.slice(beforeScheduleCount)) {
        if (timer.active) timer.callback();
      }
      assert.equal(sfu.subscribeRetryVersion(), versionAfterCleanup, `${methodName} leaves no active backoff callback to bump retry version`);
      assert.equal(timers.slice(beforeScheduleCount).every((timer) => !timer.active), true, `${methodName} clearTimeouts every tracked backoff`);
    }
  });
}

// CR-FIX-3 — live-mid conflict warning keys are cleared in every transport teardown path.
{
  for (const methodName of ['clearLocalTransportSessionState', 'closeLiveTracksForExit', 'destroy'] as const) {
    const sfu = createSfuClient();
    const privateSfu = sfu as unknown as {
      subscribeMidConflictWarnings: Set<string>;
      clearLocalTransportSessionState: () => void;
      closeLiveTracksForExit: () => void;
      destroy: () => void;
    };
    privateSfu.subscribeMidConflictWarnings.add('mid|alice|audio|bob|audio');

    privateSfu[methodName]();

    assert.equal(privateSfu.subscribeMidConflictWarnings.size, 0, `${methodName} clears subscribe mid conflict warning keys`);
  }
}

// FIX2 — transient mid-call subscribe failure retries directly and eventually commits the missing track.
{
  await withFakeTimersAsync(async (timers) => {
    const sfu = createSfuClient();
    const publisher: RemotePublisher = {
      clientId: 'alice',
      participantId: 'p-alice',
      cfSessionId: 'alice-cf',
      revision: 2,
      tracks: [
        { trackName: 'alice-video', kind: 'video' },
        { trackName: 'alice-audio', kind: 'audio' },
      ],
    };
    sfu.remotePublishers.set(new Map([['alice', publisher]]));
    const privateSfu = sfu as unknown as {
      subscribeNewRemoteTracks: (publisher: RemotePublisher, previousTracks: { trackName: string; kind: string }[]) => void;
      doSubscribeTracks: (publisher: RemotePublisher, tracks: { trackName: string; kind: string }[]) => Promise<void>;
      midToEntry: Map<string, SubscribedTrackEntry>;
      midCallSubscribeRetryAttempts: Map<string, number>;
      midCallSubscribeRetryTimers: Map<string, unknown>;
    };
    const attempts: string[][] = [];
    privateSfu.doSubscribeTracks = async (attemptPublisher, tracks) => {
      attempts.push(tracks.map((track) => track.trackName));
      if (attempts.length === 1) throw new Error('transient not_found_track_error');
      const nextSubscribed = new Map(sfu.subscribedTracks());
      for (const track of tracks) {
        const mid = `mid-${attempts.length}-${track.trackName}`;
        const entry: SubscribedTrackEntry = { publisherClientId: attemptPublisher.clientId, trackName: track.trackName, kind: track.kind, mid };
        privateSfu.midToEntry.set(mid, entry);
        nextSubscribed.set(mid, entry);
      }
      sfu.subscribedTracks.set(nextSubscribed);
    };

    privateSfu.subscribeNewRemoteTracks(publisher, [{ trackName: 'alice-video', kind: 'video' }]);
    await flushSfuQueue(sfu);

    assert.deepEqual(attempts, [['alice-audio']], 'first mid-call attempt subscribes only the newly advertised audio');
    assert.equal(privateSfu.midCallSubscribeRetryTimers.size, 1, 'failed mid-call subscribe schedules one bounded retry timer');

    const retryTimer = timers.find((timer) => timer.active);
    assert.ok(retryTimer, 'retry timer should be active');
    retryTimer.active = false;
    retryTimer.callback();
    await flushSfuQueue(sfu);

    assert.deepEqual(attempts, [['alice-audio'], ['alice-audio']], 'retry drives doSubscribeTracks directly for the missing track');
    assert.equal([...sfu.subscribedTracks().values()].some((entry) => entry.trackName === 'alice-audio'), true, 'retry success commits audio to subscribedTracks');
    assert.equal([...privateSfu.midToEntry.values()].some((entry) => entry.trackName === 'alice-audio'), true, 'retry success commits audio to midToEntry');
    assert.equal(privateSfu.midCallSubscribeRetryTimers.size, 0, 'successful retry clears the retry timer state');
    assert.equal(privateSfu.midCallSubscribeRetryAttempts.size, 0, 'successful retry clears the retry counter state');
  });
}

// FIX2 cap-exhaustion terminal-stop test removed (SEND-BACK iter 1): mid-call cap-exhaust no longer
// permanently stops — it escalates into the shared recovery coordinator's low-frequency continuation
// (R2 never-give-up invariant). That behavior is asserted in the dedicated, fake-timed
// sfu-recovery-coordinator.spec.ts (MID-CALL-NEVER-GIVES-UP) instead of here: this large legacy-style
// file mixes fake- and real-timer tests, and firing/re-arming the low-frequency timer here risks leaving
// a real background timer alive after the file's synchronous work finishes (see SFU-R3 below for the
// same class of pre-existing hazard, now guarded with an explicit teardown).

// FIX2 — successful first mid-call subscribe has no retry timer, no extra enqueue, and no churn.
{
  await withFakeTimersAsync(async () => {
    const sfu = createSfuClient();
    const publisher: RemotePublisher = {
      clientId: 'bob',
      participantId: 'p-bob',
      cfSessionId: 'bob-cf',
      revision: 2,
      tracks: [{ trackName: 'bob-audio', kind: 'audio' }],
    };
    const privateSfu = sfu as unknown as {
      subscribeNewRemoteTracks: (publisher: RemotePublisher, previousTracks: { trackName: string; kind: string }[]) => void;
      doSubscribeTracks: (publisher: RemotePublisher, tracks: { trackName: string; kind: string }[]) => Promise<void>;
      midToEntry: Map<string, SubscribedTrackEntry>;
      midCallSubscribeRetryAttempts: Map<string, number>;
      midCallSubscribeRetryTimers: Map<string, unknown>;
    };
    let calls = 0;
    privateSfu.doSubscribeTracks = async (attemptPublisher, tracks) => {
      calls += 1;
      const entry: SubscribedTrackEntry = { publisherClientId: attemptPublisher.clientId, trackName: tracks[0].trackName, kind: tracks[0].kind, mid: 'bob-mid' };
      privateSfu.midToEntry.set('bob-mid', entry);
      sfu.subscribedTracks.set(new Map([['bob-mid', entry]]));
    };

    privateSfu.subscribeNewRemoteTracks(publisher, []);
    await flushSfuQueue(sfu);

    assert.equal(calls, 1, 'successful first mid-call subscribe enqueues exactly once');
    assert.equal(privateSfu.midCallSubscribeRetryTimers.size, 0, 'successful first try schedules no retry timer');
    assert.equal(privateSfu.midCallSubscribeRetryAttempts.size, 0, 'successful first try creates no retry counter');
  });
}

// FIX2 — retry tick stops when the publisher removed the track from live remotePublishers.
{
  await withFakeTimersAsync(async (timers) => {
    const sfu = createSfuClient();
    const publisher: RemotePublisher = {
      clientId: 'carol',
      participantId: 'p-carol',
      cfSessionId: 'carol-cf',
      revision: 2,
      tracks: [{ trackName: 'carol-audio', kind: 'audio' }],
    };
    sfu.remotePublishers.set(new Map([['carol', publisher]]));
    const privateSfu = sfu as unknown as {
      subscribeNewRemoteTracks: (publisher: RemotePublisher, previousTracks: { trackName: string; kind: string }[]) => void;
      doSubscribeTracks: () => Promise<void>;
      midCallSubscribeRetryAttempts: Map<string, number>;
      midCallSubscribeRetryTimers: Map<string, unknown>;
    };
    let calls = 0;
    privateSfu.doSubscribeTracks = async () => {
      calls += 1;
      throw new Error('transient failure');
    };

    privateSfu.subscribeNewRemoteTracks(publisher, []);
    await flushSfuQueue(sfu);
    sfu.remotePublishers.set(new Map([['carol', { ...publisher, revision: 3, tracks: [] }]]));

    const retryTimer = timers.find((timer) => timer.active);
    assert.ok(retryTimer, 'retry timer should be active before track removal tick');
    retryTimer.active = false;
    retryTimer.callback();
    await flushSfuQueue(sfu);

    assert.equal(calls, 1, 'removed track is not retried');
    assert.equal(privateSfu.midCallSubscribeRetryTimers.size, 0, 'removed-track stop clears timer state');
    assert.equal(privateSfu.midCallSubscribeRetryAttempts.size, 0, 'removed-track stop clears counter state');
  });
}

// FIX2 — retry tick stops when the publisher cfSessionId changed.
{
  await withFakeTimersAsync(async (timers) => {
    const sfu = createSfuClient();
    const publisher: RemotePublisher = {
      clientId: 'dave',
      participantId: 'p-dave',
      cfSessionId: 'old-cf',
      revision: 2,
      tracks: [{ trackName: 'dave-audio', kind: 'audio' }],
    };
    sfu.remotePublishers.set(new Map([['dave', publisher]]));
    const privateSfu = sfu as unknown as {
      subscribeNewRemoteTracks: (publisher: RemotePublisher, previousTracks: { trackName: string; kind: string }[]) => void;
      doSubscribeTracks: () => Promise<void>;
      midCallSubscribeRetryAttempts: Map<string, number>;
      midCallSubscribeRetryTimers: Map<string, unknown>;
    };
    let calls = 0;
    privateSfu.doSubscribeTracks = async () => {
      calls += 1;
      throw new Error('old session failure');
    };

    privateSfu.subscribeNewRemoteTracks(publisher, []);
    await flushSfuQueue(sfu);
    sfu.remotePublishers.set(new Map([['dave', { ...publisher, cfSessionId: 'new-cf', revision: 3 }]]));

    const retryTimer = timers.find((timer) => timer.active);
    assert.ok(retryTimer, 'retry timer should be active before cfSession change tick');
    retryTimer.active = false;
    retryTimer.callback();
    await flushSfuQueue(sfu);

    assert.equal(calls, 1, 'old cfSession retry does not call doSubscribeTracks again');
    assert.equal(privateSfu.midCallSubscribeRetryTimers.size, 0, 'cfSession-change stop clears timer state');
    assert.equal(privateSfu.midCallSubscribeRetryAttempts.size, 0, 'cfSession-change stop clears counter state');
  });
}

// FIX2 — retry tick stops when the track has already been subscribed by another path.
{
  await withFakeTimersAsync(async (timers) => {
    const sfu = createSfuClient();
    const publisher: RemotePublisher = {
      clientId: 'erin',
      participantId: 'p-erin',
      cfSessionId: 'erin-cf',
      revision: 2,
      tracks: [{ trackName: 'erin-audio', kind: 'audio' }],
    };
    sfu.remotePublishers.set(new Map([['erin', publisher]]));
    const privateSfu = sfu as unknown as {
      subscribeNewRemoteTracks: (publisher: RemotePublisher, previousTracks: { trackName: string; kind: string }[]) => void;
      doSubscribeTracks: () => Promise<void>;
      midToEntry: Map<string, SubscribedTrackEntry>;
      midCallSubscribeRetryAttempts: Map<string, number>;
      midCallSubscribeRetryTimers: Map<string, unknown>;
    };
    let calls = 0;
    privateSfu.doSubscribeTracks = async () => {
      calls += 1;
      throw new Error('first path failed');
    };

    privateSfu.subscribeNewRemoteTracks(publisher, []);
    await flushSfuQueue(sfu);
    const entry: SubscribedTrackEntry = { publisherClientId: 'erin', trackName: 'erin-audio', kind: 'audio', mid: 'erin-mid' };
    privateSfu.midToEntry.set('erin-mid', entry);
    sfu.subscribedTracks.set(new Map([['erin-mid', entry]]));

    const retryTimer = timers.find((timer) => timer.active);
    assert.ok(retryTimer, 'retry timer should be active before already-subscribed tick');
    retryTimer.active = false;
    retryTimer.callback();
    await flushSfuQueue(sfu);

    assert.equal(calls, 1, 'already subscribed track is not double-subscribed');
    assert.equal(privateSfu.midCallSubscribeRetryTimers.size, 0, 'already-subscribed stop clears timer state');
    assert.equal(privateSfu.midCallSubscribeRetryAttempts.size, 0, 'already-subscribed stop clears counter state');
  });
}

// FIX2 — already-subscribed state from subscribedTracks alone suppresses initial duplicate subscribe.
{
  const sfu = createSfuClient();
  const publisher: RemotePublisher = {
    clientId: 'fran',
    participantId: 'p-fran',
    cfSessionId: 'fran-cf',
    revision: 2,
    tracks: [{ trackName: 'fran-audio', kind: 'audio' }],
  };
  const privateSfu = sfu as unknown as {
    subscribeNewRemoteTracks: (publisher: RemotePublisher, previousTracks: { trackName: string; kind: string }[]) => void;
    doSubscribeTracks: () => Promise<void>;
  };
  const entry: SubscribedTrackEntry = { publisherClientId: 'fran', trackName: 'fran-audio', kind: 'audio', mid: 'fran-mid' };
  sfu.subscribedTracks.set(new Map([['fran-mid', entry]]));
  let calls = 0;
  privateSfu.doSubscribeTracks = async () => {
    calls += 1;
  };

  privateSfu.subscribeNewRemoteTracks(publisher, []);
  await flushSfuQueue(sfu);

  assert.equal(calls, 0, 'already subscribed track in subscribedTracks is not double-subscribed');
}

// FIX2 — mid-call retry timers/counters clear in global teardown, peer teardown, and cfSession eviction.
{
  await withFakeTimersAsync(async (timers) => {
    for (const methodName of ['clearLocalTransportSessionState', 'closeLiveTracksForExit', 'destroy'] as const) {
      const sfu = createSfuClient();
      const publisher: RemotePublisher = {
        clientId: `global-${methodName}`,
        participantId: `p-${methodName}`,
        cfSessionId: `cf-${methodName}`,
        revision: 2,
        tracks: [{ trackName: `${methodName}-audio`, kind: 'audio' }],
      };
      const privateSfu = sfu as unknown as {
        scheduleMidCallSubscribeRetry: (publisher: RemotePublisher, tracks: { trackName: string; kind: string }[], err: unknown) => void;
        midCallSubscribeRetryAttempts: Map<string, number>;
        midCallSubscribeRetryTimers: Map<string, unknown>;
        clearLocalTransportSessionState: () => void;
        closeLiveTracksForExit: () => void;
        destroy: () => void;
      };
      const beforeScheduleCount = timers.length;
      privateSfu.scheduleMidCallSubscribeRetry(publisher, publisher.tracks, new Error('teardown setup'));
      assert.equal(privateSfu.midCallSubscribeRetryTimers.size, 1, `${methodName} setup tracks one pending mid-call retry`);

      privateSfu[methodName]();

      assert.equal(privateSfu.midCallSubscribeRetryTimers.size, 0, `${methodName} clears mid-call retry timers`);
      assert.equal(privateSfu.midCallSubscribeRetryAttempts.size, 0, `${methodName} clears mid-call retry counters`);
      assert.equal(timers.slice(beforeScheduleCount).every((timer) => !timer.active), true, `${methodName} clearTimeouts every tracked mid-call retry`);
    }

    const peerSfu = createSfuClient();
    const peerPrivate = peerSfu as unknown as {
      scheduleMidCallSubscribeRetry: (publisher: RemotePublisher, tracks: { trackName: string; kind: string }[], err: unknown) => void;
      midCallSubscribeRetryAttempts: Map<string, number>;
      midCallSubscribeRetryTimers: Map<string, unknown>;
      subscribedClientIds: Set<string>;
    };
    const peerPublisher: RemotePublisher = {
      clientId: 'peer-clear',
      participantId: 'p-peer-clear',
      cfSessionId: 'peer-cf',
      revision: 2,
      tracks: [{ trackName: 'peer-audio', kind: 'audio' }],
    };
    peerSfu.remotePublishers.set(new Map([['peer-clear', peerPublisher]]));
    peerPrivate.subscribedClientIds.add('peer-clear');
    peerPrivate.scheduleMidCallSubscribeRetry(peerPublisher, peerPublisher.tracks, new Error('peer setup'));
    peerSfu.removePeer('peer-clear');
    assert.equal(peerPrivate.midCallSubscribeRetryTimers.size, 0, 'removePeer clears mid-call retry timers');
    assert.equal(peerPrivate.midCallSubscribeRetryAttempts.size, 0, 'removePeer clears mid-call retry counters');

    const cfSfu = createSfuClient();
    const oldPublisher: RemotePublisher = {
      clientId: 'cf-clear',
      participantId: 'p-cf-clear',
      cfSessionId: 'old-cf',
      revision: 2,
      tracks: [{ trackName: 'cf-audio', kind: 'audio' }],
    };
    const cfPrivate = cfSfu as unknown as {
      scheduleMidCallSubscribeRetry: (publisher: RemotePublisher, tracks: { trackName: string; kind: string }[], err: unknown) => void;
      midCallSubscribeRetryAttempts: Map<string, number>;
      midCallSubscribeRetryTimers: Map<string, unknown>;
    };
    cfSfu.remotePublishers.set(new Map([['cf-clear', oldPublisher]]));
    cfPrivate.scheduleMidCallSubscribeRetry(oldPublisher, oldPublisher.tracks, new Error('cf setup'));
    cfSfu.handleSfuPresence({
      clientId: 'cf-clear',
      participantId: 'p-cf-clear',
      cfSessionId: 'new-cf',
      tracks: [{ trackName: 'cf-new-audio', kind: 'audio' }],
      revision: 3,
    });
    assert.equal(cfPrivate.midCallSubscribeRetryTimers.size, 0, 'cfSession eviction clears mid-call retry timers');
    assert.equal(cfPrivate.midCallSubscribeRetryAttempts.size, 0, 'cfSession eviction clears mid-call retry counters');
  });
}

// planInitialPublishRetry — success does not retry and is the only announce path
{
  const retry = planInitialPublishRetry({ published: true, failedAttempt: 0, cap: 3, retryableFailure: true, baseBackoffMs: 500, maxBackoffMs: 2000 });
  assert.equal(retry.outcome, 'success');
  assert.equal(retry.shouldRetry, false, 'successful publish must not retry');
  assert.equal(retry.shouldAnnounce, true, 'successful publish is allowed to announce');
  assert.equal(retry.backoffMs, null, 'successful publish has no backoff');
}

// planInitialPublishRetry — retryable failures retry until cap
{
  const first = planInitialPublishRetry({ published: false, failedAttempt: 1, cap: 3, retryableFailure: true, baseBackoffMs: 500, maxBackoffMs: 2000 });
  const second = planInitialPublishRetry({ published: false, failedAttempt: 2, cap: 3, retryableFailure: true, baseBackoffMs: 500, maxBackoffMs: 2000 });
  assert.equal(first.shouldRetry, true, 'first retryable failure should retry');
  assert.equal(first.nextAttempt, 2, 'first retry advances to attempt 2');
  assert.equal(first.backoffMs, 500, 'first retry uses base backoff');
  assert.equal(first.shouldAnnounce, false, 'intermediate retry must not announce');
  assert.equal(second.shouldRetry, true, 'second retryable failure should retry');
  assert.equal(second.nextAttempt, 3, 'second retry advances to final attempt');
  assert.equal(second.backoffMs, 1000, 'second retry doubles backoff');
  assert.equal(second.shouldAnnounce, false, 'second intermediate retry must not announce');
}

// planInitialPublishRetry — capped failure moves to after-cap state
{
  const retry = planInitialPublishRetry({ published: false, failedAttempt: 3, cap: 3, retryableFailure: true, baseBackoffMs: 500, maxBackoffMs: 2000 });
  assert.equal(retry.outcome, 'after-cap', 'cap should surface after-cap state');
  assert.equal(retry.shouldRetry, false, 'capped publish must not retry');
  assert.equal(retry.shouldAnnounce, false, 'capped publish must not announce');
  assert.equal(retry.reason, 'capped', 'capped publish should report capped reason');
}

// planInitialPublishRetry — permanent failure goes straight to after-cap state
{
  const retry = planInitialPublishRetry({ published: false, failedAttempt: 1, cap: 3, retryableFailure: false, baseBackoffMs: 500, maxBackoffMs: 2000 });
  assert.equal(retry.outcome, 'after-cap', 'permanent failure should surface action state immediately');
  assert.equal(retry.shouldRetry, false, 'permanent failure must not burn retries');
  assert.equal(retry.shouldAnnounce, false, 'permanent failure must not announce');
  assert.equal(retry.reason, 'permanent', 'permanent failure should report permanent reason');
}

// planSfuTransportRecovery — failed transport recovers immediately
{
  const recovery = planSfuTransportRecovery({
    connectionState: 'failed',
    iceConnectionState: 'failed',
    disconnectedElapsedMs: null,
    disconnectedGraceMs: 8000,
    currentAttempts: 0,
    cap: 3,
    baseBackoffMs: 500,
    maxBackoffMs: 2000,
  });
  assert.equal(recovery.action, 'recover', 'failed transport should trigger recovery');
  assert.equal(recovery.nextAttempts, 1, 'first failed recovery records attempt 1');
  assert.equal(recovery.backoffMs, 0, 'first failed recovery should run immediately');
  assert.equal(recovery.reason, 'failed');
}

// planSfuTransportRecovery — disconnected inside grace waits
{
  const recovery = planSfuTransportRecovery({
    connectionState: 'disconnected',
    iceConnectionState: 'disconnected',
    disconnectedElapsedMs: 2500,
    disconnectedGraceMs: 8000,
    currentAttempts: 0,
    cap: 3,
  });
  assert.equal(recovery.action, 'wait', 'brief disconnected state should wait for grace');
  assert.equal(recovery.nextAttempts, 0, 'waiting inside grace must not burn attempts');
  assert.equal(recovery.reason, 'disconnected-grace');
}

// planSfuTransportRecovery — connected resets pending disconnected/retry state
{
  const recovery = planSfuTransportRecovery({
    connectionState: 'connected',
    iceConnectionState: 'connected',
    disconnectedElapsedMs: 4000,
    disconnectedGraceMs: 8000,
    currentAttempts: 2,
    cap: 3,
  });
  assert.equal(recovery.action, 'reset', 'connected transport should cancel pending recovery state');
  assert.equal(recovery.nextAttempts, 0, 'connected transport resets attempts');
  assert.equal(recovery.backoffMs, null);
  assert.equal(recovery.reason, 'connected');
}

// planSfuTransportRecovery — disconnected after grace uses bounded backoff and caps
{
  const second = planSfuTransportRecovery({
    connectionState: 'disconnected',
    iceConnectionState: 'checking',
    disconnectedElapsedMs: 8500,
    disconnectedGraceMs: 8000,
    currentAttempts: 1,
    cap: 3,
    baseBackoffMs: 500,
    maxBackoffMs: 2000,
  });
  const capped = planSfuTransportRecovery({
    connectionState: 'failed',
    iceConnectionState: 'failed',
    disconnectedElapsedMs: null,
    disconnectedGraceMs: 8000,
    currentAttempts: 3,
    cap: 3,
    baseBackoffMs: 500,
    maxBackoffMs: 2000,
  });
  assert.equal(second.action, 'recover', 'expired disconnected state should recover');
  assert.equal(second.nextAttempts, 2, 'second recovery advances attempts');
  assert.equal(second.backoffMs, 500, 'second recovery uses base backoff');
  assert.equal(second.reason, 'disconnected-expired');
  assert.equal(capped.action, 'capped', 'recovery stops after cap');
  assert.equal(capped.nextAttempts, 4, 'capped attempt is recorded for diagnostics');
  assert.equal(capped.backoffMs, null, 'capped recovery must not schedule backoff');
}

// transport recovery full republish — prior STUN-only resolution force-refreshes and uses relay-capable ICE servers
{
  const relayServers: RTCIceServer[] = [{ urls: 'turn:turn.example.test:3478?transport=udp', username: 'u', credential: 'p' }];
  let forceRefreshCalls = 0;
  let getIceServersCalls = 0;
  const configs = await runFullRepublishRecovery({
    relayUnavailable: () => true,
    async forceRefresh(): Promise<RTCIceServer[]> {
      forceRefreshCalls += 1;
      return relayServers;
    },
    async getIceServers(): Promise<RTCIceServer[]> {
      getIceServersCalls += 1;
      return [{ urls: 'stun:stun.example.test:19302' }];
    },
  });

  assert.equal(forceRefreshCalls, 1, 'STUN-only prior resolution should force-refresh once before full republish');
  assert.equal(getIceServersCalls, 0, 'recovery republish should consume the forced ICE result without a second fetch');
  assert.deepEqual(configs[0]?.iceServers, relayServers, 'recovery PC should use the refreshed relay-capable ICE servers');
}

// transport recovery full republish — prior relay-capable resolution does not redundantly force-refresh
{
  const relayServers: RTCIceServer[] = [{ urls: 'turns:turn.example.test:443?transport=tcp', username: 'u', credential: 'p' }];
  let forceRefreshCalls = 0;
  let getIceServersCalls = 0;
  const configs = await runFullRepublishRecovery({
    relayUnavailable: () => false,
    async forceRefresh(): Promise<RTCIceServer[]> {
      forceRefreshCalls += 1;
      return relayServers;
    },
    async getIceServers(): Promise<RTCIceServer[]> {
      getIceServersCalls += 1;
      return relayServers;
    },
  });

  assert.equal(forceRefreshCalls, 0, 'relay-capable prior resolution should skip redundant force-refresh');
  assert.equal(getIceServersCalls, 1, 'normal recovery publish should use the existing ICE config source');
  assert.deepEqual(configs[0]?.iceServers, relayServers, 'recovery PC should still use relay-capable ICE servers');
}

// transport recovery full republish — refetch still STUN-only proceeds without hard block
{
  const stunServers: RTCIceServer[] = [{ urls: 'stun:stun.example.test:19302' }];
  let forceRefreshCalls = 0;
  let getIceServersCalls = 0;
  const configs = await runFullRepublishRecovery({
    relayUnavailable: () => true,
    async forceRefresh(): Promise<RTCIceServer[]> {
      forceRefreshCalls += 1;
      return stunServers;
    },
    async getIceServers(): Promise<RTCIceServer[]> {
      getIceServersCalls += 1;
      return [{ urls: 'turn:unexpected.example.test:3478', username: 'u', credential: 'p' }];
    },
  });

  assert.equal(forceRefreshCalls, 1, 'STUN-only prior resolution should still force-refresh once');
  assert.equal(getIceServersCalls, 0, 'STUN fallback from the forced refresh should not trigger an extra fetch loop');
  assert.deepEqual(configs[0]?.iceServers, stunServers, 'recovery PC should proceed with STUN fallback when relay is still unavailable');
}

// transport recovery full republish — teardown clears any pending one-shot recovery ICE source
{
  for (const methodName of ['closeLiveTracksForExit', 'destroy'] as const) {
    const sfu = createSfuClient();
    const privateSfu = sfu as unknown as {
      recoveryPublishIceServers: RTCIceServer[] | null;
      closeLiveTracksForExit: () => void;
      destroy: () => void;
    };
    privateSfu.recoveryPublishIceServers = [{ urls: 'turn:stale.example.test:3478', username: 'u', credential: 'p' }];
    privateSfu[methodName]();
    assert.equal(privateSfu.recoveryPublishIceServers, null, `${methodName} clears pending recovery ICE source`);
  }
}

// R4/B4 — a real successful publish() clears a prior publishRecoveryFailed=true (no stuck-true
// terminal notice once the underlying publish is actually healthy again — B4 handshake concern #3).
{
  const http = {
    post: (url: string) => {
      if (url === '/api/sfu/session') return of({ sessionId: 'cf-session' });
      if (url === '/api/sfu/tracks') return of({ sessionDescription: { type: 'answer', sdp: 'answer-sdp' } });
      throw new Error(`unexpected POST ${url}`);
    },
  } as unknown as Partial<HttpClient>;
  const sfu = createSfuClient(http);
  sfu.localPublishState.set({ cfSessionId: '', status: 'error', tracks: [], error: 'boom' });
  sfu.publishRecoveryFailed.set(true);

  await withPublishPeerConnectionRecorder(async () => {
    await sfu.publish({ clientKey: 'ck', participantId: 'local-p', sessionId: 'room-1', localStream: null });
  });

  assert.equal(sfu.localPublishState()?.status, 'published', 'sanity: the driven publish() actually reached published');
  assert.equal(sfu.publishRecoveryFailed(), false, 'a real successful publish clears publishRecoveryFailed — no stuck-true terminal notice');
}

// collectDiagnostics — international stats are parsed from one getStats report and null-safe when absent
{
  const { diagnostics, getStatsCalls } = await collectDiagnosticsFromStats(
    statsReportOf(
      {
        id: 'pair-1',
        type: 'candidate-pair',
        nominated: true,
        state: 'succeeded',
        localCandidateId: 'local-cand',
        remoteCandidateId: 'remote-cand',
        currentRoundTripTime: 0.182,
        totalRoundTripTime: 3.2,
        availableOutgoingBitrate: 1_750_000,
        availableIncomingBitrate: 2_250_000,
        bytesSent: 123_456,
        bytesReceived: 654_321,
      },
      { id: 'local-cand', type: 'local-candidate', candidateType: 'srflx', protocol: 'udp', address: '203.0.113.10', port: 49000 },
      { id: 'remote-cand', type: 'remote-candidate', candidateType: 'host', protocol: 'udp', address: '198.51.100.20', port: 3478 },
      {
        id: 'out-audio',
        type: 'outbound-rtp',
        kind: 'audio',
        mid: '0',
        ssrc: 111,
        bytesSent: 12_000,
        packetsSent: 120,
      },
      {
        id: 'out-video',
        type: 'outbound-rtp',
        kind: 'video',
        mid: '3',
        ssrc: 222,
        bytesSent: 88_000,
        packetsSent: 880,
        framesEncoded: 42,
        framesSent: 41,
      },
      {
        id: 'remote-in-audio',
        type: 'remote-inbound-rtp',
        kind: 'audio',
        localId: 'out-audio',
        ssrc: 111,
        roundTripTime: 0.191,
        fractionLost: 0.025,
        jitter: 0.006,
      },
      {
        id: 'remote-in-video',
        type: 'remote-inbound-rtp',
        kind: 'video',
        ssrc: 222,
        roundTripTime: 0.215,
        fractionLost: 0.05,
        jitter: 0.012,
      },
      {
        id: 'in-audio',
        type: 'inbound-rtp',
        kind: 'audio',
        mid: '1',
        bytesReceived: 34_000,
        packetsReceived: 340,
        packetsLost: 2,
        jitter: 0.007,
        audioLevel: 0.31,
        totalAudioEnergy: 4.25,
        jitterBufferDelay: 0.08,
        jitterBufferEmittedCount: 40,
        concealedSamples: 12,
      },
      {
        id: 'playout-audio',
        type: 'media-playout',
        kind: 'audio',
        audioLevel: 0.42,
        totalAudioEnergy: 7.5,
        totalSamplesDuration: 11.25,
      },
      {
        id: 'in-video',
        type: 'inbound-rtp',
        kind: 'video',
        mid: '2',
        bytesReceived: 134_000,
        packetsReceived: 1340,
        packetsLost: 4,
        framesDecoded: 67,
        framesReceived: 69,
        nackCount: 3,
        pliCount: 1,
      },
    ),
  );

  assert.equal(getStatsCalls, 1, 'collectDiagnostics must use exactly one getStats call');
  assert.equal(diagnostics?.selectedCandidatePair?.availableOutgoingBitrate, 1_750_000);
  assert.equal(diagnostics?.selectedCandidatePair?.availableIncomingBitrate, 2_250_000);
  assert.equal(diagnostics?.selectedCandidatePair?.currentRoundTripTime, 0.182);
  assert.equal(diagnostics?.selectedCandidatePair?.totalRoundTripTime, 3.2);
  assert.equal(diagnostics?.selectedCandidatePair?.bytesSent, 123_456);
  assert.equal(diagnostics?.selectedCandidatePair?.bytesReceived, 654_321);
  assert.equal(diagnostics?.rttMs, 182);
  assert.equal(diagnostics?.selectedCandidatePair?.local?.address, '203.0.113.10');
  assert.equal(diagnostics?.selectedCandidatePair?.remote?.address, '198.51.100.20');

  const audioOut = diagnostics?.outboundTracks.find((track) => track.kind === 'audio');
  const videoOut = diagnostics?.outboundTracks.find((track) => track.kind === 'video');
  assert.equal(audioOut?.remoteRoundTripTimeMs, 191, 'remote-inbound localId matches outbound audio');
  assert.equal(audioOut?.remoteFractionLost, 0.025);
  assert.equal(audioOut?.remoteJitterMs, 6);
  assert.equal(videoOut?.remoteRoundTripTimeMs, 215, 'remote-inbound ssrc+kind fallback matches outbound video');
  assert.equal(videoOut?.remoteFractionLost, 0.05);
  assert.equal(videoOut?.remoteJitterMs, 12);

  const audioIn = diagnostics?.inboundTracks.find((track) => track.kind === 'audio');
  const videoIn = diagnostics?.inboundTracks.find((track) => track.kind === 'video');
  assert.equal(audioIn?.audioLevel, 0.31, 'inbound audio liveness is captured');
  assert.equal(audioIn?.totalAudioEnergy, 4.25, 'legacy inbound audio energy is captured when present');
  assert.equal(audioIn?.jitter, 0.007);
  assert.equal(videoIn?.nackCount, 3);
  assert.equal(videoIn?.pliCount, 1);
  assert.deepEqual(
    diagnostics?.mediaPlayout,
    { audioLevel: 0.42, totalAudioEnergy: 7.5, totalSamplesDuration: 11.25 },
    'Chrome media-playout audio playout stats are captured',
  );

  const missing = await collectDiagnosticsFromStats(
    statsReportOf(
      { id: 'pair-min', type: 'candidate-pair', nominated: true, state: 'succeeded' },
      { id: 'out-min', type: 'outbound-rtp', kind: 'audio', mid: '0', ssrc: 333 },
      { id: 'in-min', type: 'inbound-rtp', kind: 'audio', mid: '1' },
    ),
  );
  assert.equal(missing.getStatsCalls, 1, 'missing-stat path still uses one getStats call');
  assert.equal(missing.diagnostics?.selectedCandidatePair?.availableOutgoingBitrate, null);
  assert.equal(missing.diagnostics?.outboundTracks[0]?.remoteFractionLost, null);
  assert.equal(missing.diagnostics?.inboundTracks[0]?.audioLevel, null);
  assert.equal(missing.diagnostics?.inboundTracks[0]?.totalAudioEnergy, null);
  assert.equal(missing.diagnostics?.inboundTracks[0]?.jitter, null);
  assert.equal(missing.diagnostics?.mediaPlayout, undefined);
}

// selectNewRemoteTracks — partial subscribe covers added audio/video/screen and skips existing names
{
  const previousTracks = [{ trackName: 'p1:1:audio:a1', kind: 'audio' }];
  const nextTracks = [
    { trackName: 'p1:1:audio:a1', kind: 'audio' },
    { trackName: 'p1:2:video:v1', kind: 'video' },
    { trackName: 'p1:3:screen:s1', kind: 'screen' },
    { trackName: 'p1:4:audio:a2', kind: 'audio' },
  ];
  const result = selectNewRemoteTracks(previousTracks, nextTracks, new Set(['p1:4:audio:a2']));
  assert.deepEqual(
    result.map((track) => track.trackName),
    ['p1:2:video:v1', 'p1:3:screen:s1'],
    'new remote tracks should include video and screen but skip already-subscribed audio',
  );
}

// selectNewRemoteTracks — repeat presence update does not double-subscribe an existing track
{
  const previousTracks = [
    { trackName: 'p1:1:audio:a1', kind: 'audio' },
    { trackName: 'p1:2:video:v1', kind: 'video' },
  ];
  const nextTracks = [...previousTracks];
  assert.deepEqual(selectNewRemoteTracks(previousTracks, nextTracks, new Set()).map((track) => track.trackName), []);
}

// FIX3 — fully already-subscribed doSubscribeTracks is a clean no-op before POST, stamp, or mutation.
{
  let postCalls = 0;
  const http = {
    post: () => {
      postCalls += 1;
      return of({});
    },
  } as unknown as Partial<HttpClient>;
  const sfu = createSfuClient(http);
  const pc = makeSingleTrackSubscribePc();
  installPublishedSfuState(sfu, pc);
  const privateSfu = sfu as unknown as {
    doSubscribeTracks: (publisher: RemotePublisher, tracks: { trackName: string; kind: string }[]) => Promise<void>;
    midToEntry: Map<string, SubscribedTrackEntry>;
    subscribeInitiatedAt: Map<string, number>;
  };
  const existingEntry: SubscribedTrackEntry = { publisherClientId: 'alice', trackName: 'alice-audio', kind: 'audio', mid: '1' };
  privateSfu.midToEntry.set('1', existingEntry);
  sfu.subscribedTracks.set(new Map([['1', existingEntry]]));

  await privateSfu.doSubscribeTracks(
    { clientId: 'alice', participantId: 'p-alice', cfSessionId: 'alice-cf', revision: 1, tracks: [] },
    [{ trackName: 'alice-audio', kind: 'audio' }],
  );

  assert.equal(postCalls, 0, 'already-subscribed full set does not issue POST /api/sfu/tracks');
  assert.equal(privateSfu.subscribeInitiatedAt.has('alice'), false, 'already-subscribed full set does not stamp subscribeInitiatedAt');
  assert.deepEqual([...privateSfu.midToEntry.entries()], [['1', existingEntry]], 'already-subscribed full set leaves midToEntry unchanged');
  assert.deepEqual([...sfu.subscribedTracks().entries()], [['1', existingEntry]], 'already-subscribed full set leaves subscribedTracks unchanged');
}

// FIX3 — double-trigger same-track subscribe serializes to one POST, one transceiver, and one subscribed entry.
{
  const postBodies: Array<{ tracks: Array<{ trackName: string }> }> = [];
  const http = {
    post: (_url: string, body: { tracks: Array<{ trackName: string }> }) => {
      postBodies.push(body);
      return of({
        requiresImmediateRenegotiation: true,
        sessionDescription: { type: 'offer', sdp: 'remote-offer' },
        tracks: [{ trackName: 'alice-audio', mid: '' }],
      });
    },
    put: () => of({}),
  } as unknown as Partial<HttpClient>;
  const sfu = createSfuClient(http);
  const pc = makeSingleTrackSubscribePc();
  installPublishedSfuState(sfu, pc);
  const privateSfu = sfu as unknown as {
    doSubscribeTracks: (publisher: RemotePublisher, tracks: { trackName: string; kind: string }[]) => Promise<void>;
    midToEntry: Map<string, SubscribedTrackEntry>;
  };
  const publisher: RemotePublisher = {
    clientId: 'alice',
    participantId: 'p-alice',
    cfSessionId: 'alice-cf',
    revision: 2,
    tracks: [{ trackName: 'alice-audio', kind: 'audio' }],
  };
  // Seed roster so doSubscribeTracks' stale-session guard does not fire on a matching cfSessionId.
  sfu.remotePublishers.set(new Map([['alice', publisher]]));

  await privateSfu.doSubscribeTracks(publisher, publisher.tracks);
  await privateSfu.doSubscribeTracks(publisher, publisher.tracks);

  const aliceAudioEntries = [...privateSfu.midToEntry.values()].filter((entry) => entry.publisherClientId === 'alice' && entry.trackName === 'alice-audio');
  assert.equal(postBodies.length, 1, 'double-trigger same-track subscribe issues exactly one POST');
  assert.deepEqual(postBodies[0].tracks.map((track) => track.trackName), ['alice-audio'], 'first POST subscribes the missing audio track');
  assert.equal(pc.transceiverCount(), 2, 'double-trigger same-track subscribe adds exactly one receive transceiver');
  assert.equal(aliceAudioEntries.length, 1, 'double-trigger same-track subscribe commits exactly one subscribed entry');
  assert.equal(sfu.subscribedTracks().size, 1, 'double-trigger same-track subscribe leaves exactly one subscribedTracks entry');
}

// FIX3 — mixed already-subscribed and missing tracks POST/reconcile only the missing track.
{
  const postBodies: Array<{ tracks: Array<{ trackName: string }> }> = [];
  const http = {
    post: (_url: string, body: { tracks: Array<{ trackName: string }> }) => {
      postBodies.push(body);
      return of({
        requiresImmediateRenegotiation: true,
        sessionDescription: { type: 'offer', sdp: 'remote-offer' },
        tracks: [{ trackName: 'bob-new-audio', mid: '' }],
      });
    },
    put: () => of({}),
  } as unknown as Partial<HttpClient>;
  const sfu = createSfuClient(http);
  const pc = makeSingleTrackSubscribePc();
  installPublishedSfuState(sfu, pc);
  const privateSfu = sfu as unknown as {
    doSubscribeTracks: (publisher: RemotePublisher, tracks: { trackName: string; kind: string }[]) => Promise<void>;
    midToEntry: Map<string, SubscribedTrackEntry>;
  };
  const existingEntry: SubscribedTrackEntry = { publisherClientId: 'bob', trackName: 'bob-old-audio', kind: 'audio', mid: 'old-mid' };
  privateSfu.midToEntry.set('old-mid', existingEntry);
  sfu.subscribedTracks.set(new Map([['old-mid', existingEntry]]));
  const tracks = [
    { trackName: 'bob-old-audio', kind: 'audio' },
    { trackName: 'bob-new-audio', kind: 'audio' },
  ];
  const bobPublisher: RemotePublisher = { clientId: 'bob', participantId: 'p-bob', cfSessionId: 'bob-cf', revision: 2, tracks };
  sfu.remotePublishers.set(new Map([['bob', bobPublisher]]));

  await privateSfu.doSubscribeTracks(bobPublisher, tracks);

  assert.equal(postBodies.length, 1, 'mixed subscribe still POSTs for a genuinely missing track');
  assert.deepEqual(postBodies[0].tracks.map((track) => track.trackName), ['bob-new-audio'], 'POST body excludes already-subscribed tracks');
  assert.equal(privateSfu.midToEntry.get('old-mid'), existingEntry, 'existing subscribed entry is preserved');
  assert.equal(privateSfu.midToEntry.get('1')?.trackName, 'bob-new-audio', 'missing track is reconciled and committed');
  assert.equal(sfu.subscribedTracks().get('1')?.trackName, 'bob-new-audio', 'missing track reaches subscribedTracks');
}

// FIX3 — FIX2 mid-call retry of a truly missing track still drives real doSubscribeTracks to success.
{
  await withFakeTimersAsync(async (timers) => {
    let postCalls = 0;
    const http = {
      post: () => {
        postCalls += 1;
        if (postCalls === 1) {
          return of({
            tracks: [{ trackName: 'carol-audio', mid: '', errorCode: 'not_found_track_error' }],
          });
        }
        return of({
          requiresImmediateRenegotiation: true,
          sessionDescription: { type: 'offer', sdp: 'remote-offer' },
          tracks: [{ trackName: 'carol-audio', mid: '' }],
        });
      },
      put: () => of({}),
    } as unknown as Partial<HttpClient>;
    const sfu = createSfuClient(http);
    const pc = makeSingleTrackSubscribePc();
    installPublishedSfuState(sfu, pc);
    const publisher: RemotePublisher = {
      clientId: 'carol',
      participantId: 'p-carol',
      cfSessionId: 'carol-cf',
      revision: 2,
      tracks: [{ trackName: 'carol-audio', kind: 'audio' }],
    };
    sfu.remotePublishers.set(new Map([['carol', publisher]]));
    const privateSfu = sfu as unknown as {
      subscribeNewRemoteTracks: (publisher: RemotePublisher, previousTracks: { trackName: string; kind: string }[]) => void;
      midToEntry: Map<string, SubscribedTrackEntry>;
      midCallSubscribeRetryTimers: Map<string, unknown>;
    };

    privateSfu.subscribeNewRemoteTracks(publisher, []);
    await flushSfuQueue(sfu);

    assert.equal(postCalls, 1, 'first truly-missing mid-call subscribe attempts once');
    assert.equal(privateSfu.midCallSubscribeRetryTimers.size, 1, 'transient real doSubscribeTracks failure schedules FIX2 retry');

    const retryTimer = timers.find((timer) => timer.active);
    assert.ok(retryTimer, 'FIX2 retry timer should be active for a truly missing track');
    retryTimer.active = false;
    retryTimer.callback();
    await flushSfuQueue(sfu);

    assert.equal(postCalls, 2, 'FIX2 retry re-enters real doSubscribeTracks for the truly missing track');
    assert.equal(privateSfu.midToEntry.get('1')?.trackName, 'carol-audio', 'FIX2 retry success commits missing track to midToEntry');
    assert.equal(sfu.subscribedTracks().get('1')?.trackName, 'carol-audio', 'FIX2 retry success reaches subscribedTracks');
    assert.equal(privateSfu.midCallSubscribeRetryTimers.size, 0, 'successful real FIX2 retry clears timer state');
  });
}

// SFU-S1 — failed subscribe renegotiate restores touched mid entries, subscribedTracks, retry metadata, and rolls back PC.
{
  await withFakeMediaStream(async () => {
    let sfu!: SfuClientService;
    const http = {
      post: () =>
        of({
          requiresImmediateRenegotiation: true,
          sessionDescription: { type: 'offer', sdp: 'remote-offer' },
          tracks: [
            { trackName: 'p-alice:1:audio:a1', mid: '' },
            { trackName: 'p-alice:1:video:v1', mid: '' },
          ],
        }),
      put: () => {
        const aliceStream = new MediaStream();
        aliceStream.addTrack({ kind: 'audio', id: 'alice-browser-track' } as MediaStreamTrack);
        sfu.remoteStreams.set(new Map([['concurrent-alice', aliceStream]]));
        sfu.remoteTrackNames.set(new Map([['concurrent-alice', new Map([['alice-browser-track', 'alice-audio']])]]));
        return throwError(() => new Error('renegotiate failed'));
      },
    } as unknown as Partial<HttpClient>;
    sfu = createSfuClient(http);
    const pc = makeSubscribePc({ renegotiateFails: true });
    installPublishedSfuState(sfu, pc);

    const privateSfu = sfu as unknown as {
      doSubscribeTracks: (publisher: RemotePublisher, tracks: { trackName: string; kind: string }[]) => Promise<void>;
      midToEntry: Map<string, SubscribedTrackEntry>;
      pendingOntrack: Map<string, RTCTrackEvent>;
      subscribeRetryAttempts: Map<string, number>;
      subscribeFirstFrameAt: Map<string, number>;
    };
    const priorOverwritten: SubscribedTrackEntry = { publisherClientId: 'old-client', trackName: 'old-audio', kind: 'audio', mid: '2' };
    const priorUntouched: SubscribedTrackEntry = { publisherClientId: 'other-client', trackName: 'other-video', kind: 'video', mid: '9' };
    privateSfu.midToEntry.set('2', priorOverwritten);
    privateSfu.midToEntry.set('9', priorUntouched);
    privateSfu.pendingOntrack.set('2', { track: { kind: 'audio', id: 'ghost-audio' } } as RTCTrackEvent);
    sfu.subscribedTracks.set(
      new Map([
        ['2', priorOverwritten],
        ['9', priorUntouched],
      ]),
    );
    privateSfu.subscribeRetryAttempts.set('alice', 3);
    privateSfu.subscribeFirstFrameAt.set('alice', 1234);
    sfu.remotePublishers.set(new Map([['alice', { clientId: 'alice', participantId: 'p-alice', cfSessionId: 'alice-cf', revision: 1, tracks: [] }]]));

    await assert.rejects(
      privateSfu.doSubscribeTracks(
        { clientId: 'alice', participantId: 'p-alice', cfSessionId: 'alice-cf', revision: 1, tracks: [] },
        [
          { trackName: 'p-alice:1:audio:a1', kind: 'audio' },
          { trackName: 'p-alice:1:video:v1', kind: 'video' },
        ],
      ),
      /renegotiate failed/,
    );

    assert.deepEqual([...privateSfu.midToEntry.entries()], [
      ['2', priorOverwritten],
      ['9', priorUntouched],
    ]);
    assert.deepEqual([...sfu.subscribedTracks().entries()], [
      ['2', priorOverwritten],
      ['9', priorUntouched],
    ]);
    assert.equal(sfu.remoteStreams().has('alice'), false, 'failed renegotiate leaves no ghost remote audio stream');
    assert.equal(sfu.remoteScreenStreams().has('alice'), false, 'failed renegotiate leaves no ghost remote screen stream');
    assert.equal(sfu.remoteStreams().has('concurrent-alice'), true, 'failed bob/alice rollback preserves unrelated concurrent ontrack stream');
    assert.equal(
      sfu.remoteTrackNames().get('concurrent-alice')?.get('alice-browser-track'),
      'alice-audio',
      'failed rollback preserves unrelated concurrent trackName metadata',
    );
    assert.equal(privateSfu.subscribeRetryAttempts.get('alice'), 3, 'failed subscribe restores prior retry attempts');
    assert.equal(privateSfu.subscribeFirstFrameAt.get('alice'), 1234, 'failed subscribe restores prior first-frame marker');
    assert.equal(pc.rollbackCount, 1, 'failed renegotiate attempts PC rollback');
  });
}

// SFU-S1 — successful subscribe renegotiate commits reconciled mids into both maps.
{
  const http = {
    post: () =>
      of({
        requiresImmediateRenegotiation: true,
        sessionDescription: { type: 'offer', sdp: 'remote-offer' },
        tracks: [
          { trackName: 'p-bob:1:audio:a1', mid: '' },
          { trackName: 'p-bob:1:video:v1', mid: '' },
        ],
      }),
    put: () => of({}),
  } as unknown as Partial<HttpClient>;
  const sfu = createSfuClient(http);
  const pc = makeSubscribePc({ renegotiateFails: false });
  installPublishedSfuState(sfu, pc);
  const privateSfu = sfu as unknown as {
    doSubscribeTracks: (publisher: RemotePublisher, tracks: { trackName: string; kind: string }[]) => Promise<void>;
    midToEntry: Map<string, SubscribedTrackEntry>;
  };

  sfu.remotePublishers.set(new Map([['bob', { clientId: 'bob', participantId: 'p-bob', cfSessionId: 'bob-cf', revision: 1, tracks: [] }]]));
  await privateSfu.doSubscribeTracks(
    { clientId: 'bob', participantId: 'p-bob', cfSessionId: 'bob-cf', revision: 1, tracks: [] },
    [
      { trackName: 'p-bob:1:audio:a1', kind: 'audio' },
      { trackName: 'p-bob:1:video:v1', kind: 'video' },
    ],
  );

  assert.equal(privateSfu.midToEntry.get('2')?.trackName, 'p-bob:1:audio:a1', 'audio mid committed to routing map');
  assert.equal(privateSfu.midToEntry.get('3')?.trackName, 'p-bob:1:video:v1', 'video mid committed to routing map');
  assert.equal(sfu.subscribedTracks().get('2')?.trackName, 'p-bob:1:audio:a1', 'audio mid committed to subscribed signal');
  assert.equal(sfu.subscribedTracks().get('3')?.trackName, 'p-bob:1:video:v1', 'video mid committed to subscribed signal');
  assert.equal(pc.rollbackCount, 0, 'successful renegotiate does not roll back');
}

// IMPL-2 — no-renegotiation subscribe keeps two live publisher audio mids and remote streams side by side.
{
  await withFakeMediaStream(async () => {
    let postCalls = 0;
    const http = {
      post: () => {
        postCalls += 1;
        return of({
          tracks: [{ trackName: postCalls === 1 ? 'alice-audio' : 'bob-audio', mid: String(postCalls) }],
        });
      },
    } as unknown as Partial<HttpClient>;
    const sfu = createSfuClient(http);
    const pc = makeSingleTrackSubscribePc();
    installPublishedSfuState(sfu, pc);
    const privateSfu = sfu as unknown as {
      doSubscribeTracks: (publisher: RemotePublisher, tracks: { trackName: string; kind: string }[]) => Promise<void>;
      processOntrack: (event: RTCTrackEvent, entry: SubscribedTrackEntry) => void;
      midToEntry: Map<string, SubscribedTrackEntry>;
    };
    const alice: RemotePublisher = {
      clientId: 'alice',
      participantId: 'p-alice',
      cfSessionId: 'alice-cf',
      revision: 1,
      tracks: [{ trackName: 'alice-audio', kind: 'audio' }],
    };
    const bob: RemotePublisher = {
      clientId: 'bob',
      participantId: 'p-bob',
      cfSessionId: 'bob-cf',
      revision: 1,
      tracks: [{ trackName: 'bob-audio', kind: 'audio' }],
    };
    sfu.remotePublishers.set(
      new Map([
        ['alice', alice],
        ['bob', bob],
      ]),
    );

    await privateSfu.doSubscribeTracks(alice, alice.tracks);
    await privateSfu.doSubscribeTracks(bob, bob.tracks);
    const aliceEntry = privateSfu.midToEntry.get('1')!;
    const bobEntry = privateSfu.midToEntry.get('2')!;
    privateSfu.processOntrack({ track: { kind: 'audio' } } as RTCTrackEvent, aliceEntry);
    privateSfu.processOntrack({ track: { kind: 'audio' } } as RTCTrackEvent, bobEntry);

    assert.equal(aliceEntry.publisherClientId, 'alice', 'alice audio keeps its own mid');
    assert.equal(bobEntry.publisherClientId, 'bob', 'bob audio keeps its own mid');
    assert.equal(sfu.subscribedTracks().get('1')?.publisherClientId, 'alice', 'alice remains subscribed');
    assert.equal(sfu.subscribedTracks().get('2')?.publisherClientId, 'bob', 'bob remains subscribed');
    assert.equal(sfu.remoteStreams().has('alice'), true, 'alice remote stream is present');
    assert.equal(sfu.remoteStreams().has('bob'), true, 'bob remote stream is present');
  });
}

// CR-FIX-5 — live cross-publisher mid collision forces bounded renegotiation and never burns permanent-stop retry caps.
{
  await withFakeTimersAsync(async (timers) => {
    let warnCalls = 0;
    const originalWarn = console.warn;
    console.warn = () => {
      warnCalls += 1;
    };
    try {
      const postBodies: Array<{ forceRenegotiation?: boolean }> = [];
      let postCalls = 0;
      const http = {
        post: (_url: string, body: { forceRenegotiation?: boolean }) => {
          postBodies.push(body);
          postCalls += 1;
          if (postCalls === 1) {
            return of({
              tracks: [{ trackName: 'bob-audio', mid: '1' }],
            });
          }
          return of({
            requiresImmediateRenegotiation: true,
            sessionDescription: { type: 'offer', sdp: 'remote-offer' },
            tracks: [{ trackName: 'bob-audio', mid: '' }],
          });
        },
        put: () => of({}),
      } as unknown as Partial<HttpClient>;
      const sfu = createSfuClient(http);
      const transceivers = [
        { mid: '0', receiver: { track: { kind: 'audio' } } },
        { mid: '1', receiver: { track: { kind: 'audio' } } },
      ];
      let localDescription: RTCSessionDescriptionInit | null = null;
      const pc = {
        connectionState: 'connected',
        iceConnectionState: 'connected',
        signalingState: 'stable',
        get localDescription(): RTCSessionDescriptionInit | null {
          return localDescription;
        },
        getTransceivers(): RTCRtpTransceiver[] {
          return transceivers as unknown as RTCRtpTransceiver[];
        },
        async setRemoteDescription(): Promise<void> {
          transceivers.push({ mid: '2', receiver: { track: { kind: 'audio' } } });
        },
        async createAnswer(): Promise<RTCSessionDescriptionInit> {
          return { type: 'answer', sdp: 'answer-sdp' };
        },
        async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
          localDescription = desc;
        },
      } as unknown as RTCPeerConnection;
      installPublishedSfuState(sfu, pc);
      const privateSfu = sfu as unknown as {
        midToEntry: Map<string, SubscribedTrackEntry>;
        subscribedClientIds: Set<string>;
        subscribeRetryAttempts: Map<string, number>;
        midCallSubscribeRetryAttempts: Map<string, number>;
        liveMidConflictRetryAttempts: Map<string, number>;
        liveMidConflictRetryTimers: Map<string, unknown>;
      };
      const alice: RemotePublisher = {
        clientId: 'alice',
        participantId: 'p-alice',
        cfSessionId: 'alice-cf',
        revision: 1,
        tracks: [{ trackName: 'alice-audio', kind: 'audio' }],
      };
      const bob: RemotePublisher = {
        clientId: 'bob',
        participantId: 'p-bob',
        cfSessionId: 'bob-cf',
        revision: 1,
        tracks: [{ trackName: 'bob-audio', kind: 'audio' }],
      };
      const aliceEntry: SubscribedTrackEntry = { publisherClientId: 'alice', trackName: 'alice-audio', kind: 'audio', mid: '1' };
      privateSfu.midToEntry.set('1', aliceEntry);
      sfu.subscribedTracks.set(new Map([['1', aliceEntry]]));
      sfu.remotePublishers.set(
        new Map([
          ['alice', alice],
          ['bob', bob],
        ]),
      );

      sfu.subscribeIfNeeded(bob);
      await flushSfuQueue(sfu);

      assert.equal(privateSfu.midToEntry.get('1'), aliceEntry, 'live alice mid mapping is preserved after bob collision');
      assert.equal(sfu.subscribedTracks().get('1'), aliceEntry, 'live alice subscribed entry is preserved after bob collision');
      assert.equal(privateSfu.subscribeRetryAttempts.has('bob'), false, 'live mid conflict does not increment permanent-stop subscribe retry attempts');
      assert.equal(privateSfu.midCallSubscribeRetryAttempts.size, 0, 'live mid conflict does not increment mid-call permanent-stop retry attempts');
      assert.equal(privateSfu.liveMidConflictRetryTimers.size, 1, 'live mid conflict schedules one idempotent renegotiation retry');

      const retryTimer = timers.filter((timer) => timer.active).at(-1);
      assert.ok(retryTimer, 'renegotiation retry timer should be active');
      retryTimer.active = false;
      retryTimer.callback();
      await flushSfuQueue(sfu);

      assert.equal(postBodies.length, 2, 'live conflict performs initial subscribe plus one forced renegotiating retry');
      assert.equal(postBodies[0].forceRenegotiation, false, 'initial subscribe does not force renegotiation');
      assert.equal(postBodies[1].forceRenegotiation, true, 'retry requests renegotiating subscribe for fresh mids');
      assert.equal(privateSfu.midToEntry.get('1'), aliceEntry, 'alice keeps original mid after bob converges');
      assert.equal(privateSfu.midToEntry.get('2')?.publisherClientId, 'bob', 'bob converges on a fresh renegotiated mid');
      assert.equal(sfu.subscribedTracks().get('2')?.publisherClientId, 'bob', 'bob reaches subscribedTracks after renegotiation');
      assert.equal(privateSfu.subscribedClientIds.has('bob'), true, 'bob remains subscribed, not permanently stopped');
      assert.equal(privateSfu.subscribeRetryAttempts.has('bob'), false, 'successful conflict recovery leaves permanent-stop attempts empty');
      assert.equal(privateSfu.liveMidConflictRetryAttempts.size, 0, 'successful conflict recovery clears conflict retry counter');
      assert.equal(warnCalls >= 2, true, 'conflict and forced-renegotiation paths warn loudly');
    } finally {
      console.warn = originalWarn;
    }
  });
}

// IMPL-2 — stale cross-publisher mid mapping is reclaimed for the current publisher.
{
  const http = {
    post: () =>
      of({
        tracks: [{ trackName: 'bob-audio', mid: '1' }],
      }),
  } as unknown as Partial<HttpClient>;
  const sfu = createSfuClient(http);
  const pc = makeSingleTrackSubscribePc();
  installPublishedSfuState(sfu, pc);
  const privateSfu = sfu as unknown as {
    doSubscribeTracks: (publisher: RemotePublisher, tracks: { trackName: string; kind: string }[]) => Promise<void>;
    midToEntry: Map<string, SubscribedTrackEntry>;
  };
  const bob: RemotePublisher = {
    clientId: 'bob',
    participantId: 'p-bob',
    cfSessionId: 'bob-cf',
    revision: 1,
    tracks: [{ trackName: 'bob-audio', kind: 'audio' }],
  };
  const staleAliceEntry: SubscribedTrackEntry = { publisherClientId: 'alice', trackName: 'alice-audio', kind: 'audio', mid: '1' };
  privateSfu.midToEntry.set('1', staleAliceEntry);
  sfu.subscribedTracks.set(new Map([['1', staleAliceEntry]]));
  sfu.remotePublishers.set(new Map([['bob', bob]]));

  await privateSfu.doSubscribeTracks(bob, bob.tracks);

  assert.equal(privateSfu.midToEntry.get('1')?.publisherClientId, 'bob', 'stale alice mid is reclaimed for bob');
  assert.equal(privateSfu.midToEntry.get('1')?.trackName, 'bob-audio', 'reclaimed mid carries bob track name');
  assert.equal(sfu.subscribedTracks().get('1')?.publisherClientId, 'bob', 'subscribed signal replaces stale alice with bob');
}

// SFU-S2 — new cfSessionId for a known clientId evicts stale subscribe state before fresh subscribe.
{
  const sfu = createSfuClient();
  const privateSfu = sfu as unknown as {
    midToEntry: Map<string, SubscribedTrackEntry>;
    subscribedClientIds: Set<string>;
    subscribeRetryAttempts: Map<string, number>;
    subscribeFirstFrameAt: Map<string, number>;
  };
  const staleEntry: SubscribedTrackEntry = { publisherClientId: 'alice', trackName: 'alice-old-audio', kind: 'audio', mid: '5' };
  sfu.remotePublishers.set(
    new Map([
      [
        'alice',
        {
          clientId: 'alice',
          participantId: 'p-alice',
          cfSessionId: 'old-cf',
          tracks: [{ trackName: 'alice-old-audio', kind: 'audio' }],
          revision: 1,
        },
      ],
    ]),
  );
  privateSfu.midToEntry.set('5', staleEntry);
  sfu.subscribedTracks.set(new Map([['5', staleEntry]]));
  privateSfu.subscribedClientIds.add('alice');
  privateSfu.subscribeRetryAttempts.set('alice', 4);
  privateSfu.subscribeFirstFrameAt.set('alice', 100);

  sfu.handleSfuPresence({
    clientId: 'alice',
    participantId: 'p-alice',
    cfSessionId: 'new-cf',
    tracks: [{ trackName: 'alice-new-audio', kind: 'audio' }],
    revision: 2,
  });

  assert.equal(privateSfu.midToEntry.has('5'), false, 'presence new cfSession evicts stale midToEntry entry');
  assert.equal(sfu.subscribedTracks().has('5'), false, 'presence new cfSession evicts stale subscribedTracks entry');
  assert.equal(privateSfu.subscribedClientIds.has('alice'), false, 'presence new cfSession clears subscribe guard');
  assert.equal(privateSfu.subscribeRetryAttempts.has('alice'), false, 'presence new cfSession clears retry attempts');
  assert.equal(privateSfu.subscribeFirstFrameAt.has('alice'), false, 'presence new cfSession clears first-frame retry state');

  const staleRosterEntry: SubscribedTrackEntry = { publisherClientId: 'alice', trackName: 'alice-roster-old-video', kind: 'video', mid: '6' };
  privateSfu.midToEntry.set('6', staleRosterEntry);
  sfu.subscribedTracks.set(new Map([['6', staleRosterEntry]]));
  privateSfu.subscribedClientIds.add('alice');
  privateSfu.subscribeRetryAttempts.set('alice', 2);
  privateSfu.subscribeFirstFrameAt.set('alice', 200);

  sfu.handleSfuRoster([
    {
      clientId: 'alice',
      participantId: 'p-alice',
      cfSessionId: 'roster-new-cf',
      tracks: [{ trackName: 'alice-roster-new-video', kind: 'video' }],
      revision: 3,
    },
  ]);

  assert.equal(privateSfu.midToEntry.has('6'), false, 'roster new cfSession evicts stale midToEntry entry');
  assert.equal(sfu.subscribedTracks().has('6'), false, 'roster new cfSession evicts stale subscribedTracks entry');
  assert.equal(privateSfu.subscribedClientIds.has('alice'), false, 'roster new cfSession clears subscribe guard');
  assert.equal(privateSfu.subscribeRetryAttempts.has('alice'), false, 'roster new cfSession clears retry attempts');
  assert.equal(privateSfu.subscribeFirstFrameAt.has('alice'), false, 'roster new cfSession clears first-frame retry state');
}

// SFU-R3 — publisher republishes (new cfSession + new trackName) → subscriber re-subscribes to the
//           current trackName immediately; the CF POST carries the new cfSessionId, not the stale one.
{
  const postBodies: Array<{ cfSessionId: string; tracks: Array<{ sessionId: string; trackName: string }> }> = [];
  const http = {
    post: (_url: string, body: unknown) => {
      postBodies.push(body as (typeof postBodies)[0]);
      // Abort after recording — we only care that the POST was issued with the right params.
      return throwError(() => new Error('SFU-R3: test-stop-after-record'));
    },
  } as unknown as Partial<HttpClient>;
  const sfu = createSfuClient(http);
  const pc = makeSingleTrackSubscribePc();
  installPublishedSfuState(sfu, pc);
  const privateSfu = sfu as unknown as {
    midToEntry: Map<string, SubscribedTrackEntry>;
    subscribedClientIds: Set<string>;
  };

  // Seed: alice was subscribed to old-cf/alice-old-audio
  const staleEntry: SubscribedTrackEntry = { publisherClientId: 'alice', trackName: 'alice-old-audio', kind: 'audio', mid: '5' };
  privateSfu.midToEntry.set('5', staleEntry);
  sfu.subscribedTracks.set(new Map([['5', staleEntry]]));
  privateSfu.subscribedClientIds.add('alice');
  sfu.remotePublishers.set(new Map([['alice', {
    clientId: 'alice', participantId: 'p-alice',
    cfSessionId: 'old-cf', tracks: [{ trackName: 'alice-old-audio', kind: 'audio' }], revision: 1,
  }]]));

  // Reconnect: presence with new cfSession arrives
  sfu.handleSfuPresence({
    clientId: 'alice', participantId: 'p-alice',
    cfSessionId: 'new-cf', tracks: [{ trackName: 'alice-new-audio', kind: 'audio' }], revision: 2,
  });
  await flushSfuQueue(sfu);

  assert.equal(postBodies.length, 1, 'SFU-R3: exactly one CF subscribe POST issued on publisher reconnect');
  const postedTrack = postBodies[0]?.tracks?.[0];
  assert.equal(postedTrack?.sessionId, 'new-cf', 'SFU-R3: POST carries new cfSessionId, not stale');
  assert.equal(postedTrack?.trackName, 'alice-new-audio', 'SFU-R3: POST carries new trackName, not stale');
  assert.equal(privateSfu.midToEntry.has('5'), false, 'SFU-R3: stale midToEntry evicted before re-subscribe');
  assert.equal(sfu.subscribedTracks().has('5'), false, 'SFU-R3: stale subscribedTrack evicted before re-subscribe');

  // The http mock above always throws, so the never-give-up recovery ladder (R2) has armed a real
  // (non-fake-timer) rung-1 backoff timer by this point. This test isn't wrapped in withFakeTimersAsync
  // and isn't exercising recovery — tear down before it fires so it can't cascade into the low-frequency
  // continuation and leave a real timer alive after the file finishes (SEND-BACK iter 1 test-hygiene fix).
  sfu.destroy();
}

// SFU-R4 — in-flight doSubscribe(oldPublisher) that completes AFTER publisher reconnect MUST NOT
//           bind a dead track. The stale-cfSession guard in doSubscribeTracks aborts the bind.
{
  const http = {
    post: () =>
      // CF accepts the subscribe (simulates stale session briefly still live) — no-renegotiation path
      of({ tracks: [{ trackName: 'alice-old-audio', mid: '5' }], requiresImmediateRenegotiation: false }),
  } as unknown as Partial<HttpClient>;
  const sfu = createSfuClient(http);
  const pc = makeSingleTrackSubscribePc();
  installPublishedSfuState(sfu, pc);
  const privateSfu = sfu as unknown as {
    midToEntry: Map<string, SubscribedTrackEntry>;
    subscribedClientIds: Set<string>;
    doSubscribeTracks: (
      publisher: import('./sfu-roster-utils.js').RemotePublisher,
      tracks: { trackName: string; kind: string }[],
    ) => Promise<void>;
  };

  // Publisher reconnected: remotePublishers already reflects the new cfSession
  sfu.remotePublishers.set(new Map([['alice', {
    clientId: 'alice', participantId: 'p-alice',
    cfSessionId: 'new-cf', tracks: [{ trackName: 'alice-new-audio', kind: 'audio' }], revision: 2,
  }]]));

  // Simulate the in-flight old subscribe completing with the stale publisher object
  const oldPublisher: import('./sfu-roster-utils.js').RemotePublisher = {
    clientId: 'alice', participantId: 'p-alice',
    cfSessionId: 'old-cf', tracks: [{ trackName: 'alice-old-audio', kind: 'audio' }], revision: 1,
  };
  await privateSfu.doSubscribeTracks(oldPublisher, oldPublisher.tracks);

  // Guard must have fired: no dead-track bind in any state map
  assert.equal(privateSfu.midToEntry.has('5'), false, 'SFU-R4: stale-session guard prevents dead mid binding');
  assert.equal(sfu.subscribedTracks().has('5'), false, 'SFU-R4: stale-session guard prevents dead subscribedTracks entry');
  assert.equal(sfu.remoteStreams().has('alice'), false, 'SFU-R4: stale-session guard prevents dead remoteStreams entry');
}

// SFU-R5 — in-flight doSubscribe(oldPublisher) completes AFTER the publisher LEFT the roster entirely
//           (removePeer was called). Guard must fire on !publisherCurrent and abort the bind — the
//           publisher-left case where tearDownPeerSubscription may have sent mids.length=0 (subscribe
//           still in-flight at teardown time, so no midToEntry entries yet → no CF close enqueued).
{
  const http = {
    post: () =>
      of({ tracks: [{ trackName: 'alice-audio', mid: '7' }], requiresImmediateRenegotiation: false }),
  } as unknown as Partial<HttpClient>;
  const sfu = createSfuClient(http);
  const pc = makeSingleTrackSubscribePc();
  installPublishedSfuState(sfu, pc);
  const privateSfu = sfu as unknown as {
    midToEntry: Map<string, SubscribedTrackEntry>;
    subscribedClientIds: Set<string>;
    doSubscribeTracks: (
      publisher: import('./sfu-roster-utils.js').RemotePublisher,
      tracks: { trackName: string; kind: string }[],
    ) => Promise<void>;
  };

  // Publisher has already left — roster is empty
  sfu.remotePublishers.set(new Map());

  const departedPublisher: import('./sfu-roster-utils.js').RemotePublisher = {
    clientId: 'alice', participantId: 'p-alice',
    cfSessionId: 'old-cf', tracks: [{ trackName: 'alice-audio', kind: 'audio' }], revision: 1,
  };
  await privateSfu.doSubscribeTracks(departedPublisher, departedPublisher.tracks);

  assert.equal(privateSfu.midToEntry.has('7'), false, 'SFU-R5: departed-publisher guard prevents dead mid binding');
  assert.equal(sfu.subscribedTracks().has('7'), false, 'SFU-R5: departed-publisher guard prevents dead subscribedTracks entry');
  assert.equal(sfu.remoteStreams().has('alice'), false, 'SFU-R5: departed-publisher guard prevents dead remoteStreams entry');
}

// SFU-S4 — failed screen publish rolls back local offer and clears the added screen transceiver/sender.
{
  const http = {
    post: () => throwError(() => new Error('screen publish failed')),
  } as unknown as Partial<HttpClient>;
  const sfu = createSfuClient(http);
  let replacedWith: MediaStreamTrack | null | undefined = undefined;
  let stopCount = 0;
  const transceiver = {
    mid: '8',
    sender: {
      async replaceTrack(track: MediaStreamTrack | null): Promise<void> {
        replacedWith = track;
      },
    },
    stop(): void {
      stopCount += 1;
    },
  } as unknown as RTCRtpTransceiver;
  type ScreenPublishPc = {
    rollbackCount: number;
    signalingState: RTCSignalingState;
    localDescription: RTCSessionDescriptionInit | null;
    addTransceiver: () => RTCRtpTransceiver;
    createOffer: () => Promise<RTCSessionDescriptionInit>;
    setLocalDescription: (desc: RTCSessionDescriptionInit) => Promise<void>;
  };
  const pc: ScreenPublishPc = {
    rollbackCount: 0,
    signalingState: 'stable',
    localDescription: null as RTCSessionDescriptionInit | null,
    addTransceiver: () => transceiver,
    async createOffer(): Promise<RTCSessionDescriptionInit> {
      return { type: 'offer', sdp: 'screen-offer' };
    },
    async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
      if (desc.type === 'rollback') {
        this.rollbackCount += 1;
        this.signalingState = 'stable';
        this.localDescription = null;
        return;
      }
      this.localDescription = desc;
      this.signalingState = 'have-local-offer';
    },
  };
  installPublishedSfuState(sfu, pc as unknown as RTCPeerConnection);
  const privateSfu = sfu as unknown as {
    doPublishScreen: (track: MediaStreamTrack) => Promise<void>;
    screenSender: RTCRtpSender | null;
  };

  await assert.rejects(privateSfu.doPublishScreen({ kind: 'video' } as MediaStreamTrack), /screen publish failed/);

  assert.equal(privateSfu.screenSender, null, 'failed screen publish clears screenSender');
  assert.equal(pc.rollbackCount, 1, 'failed screen publish attempts pending-offer rollback');
  assert.equal(replacedWith, null, 'failed screen publish removes track from added sender');
  assert.equal(stopCount, 1, 'failed screen publish stops added transceiver');
  assert.deepEqual(sfu.localPublishState()?.tracks, [], 'failed screen publish does not append screen track state');
}

// reconcileSubscribedMids — audio+video both mid:"" (duplicate-key collision case)
{
  const responseTracks = [
    { trackName: 'p1:1:audio:a1', mid: '' },
    { trackName: 'p1:1:video:v1', mid: '' },
  ];
  const newTransceiverMids = ['2', '3'];
  const transceivers = makeTransceivers([
    { mid: '2', receiverKind: 'audio' },
    { mid: '3', receiverKind: 'video' },
  ]);
  const kindMap = new Map([['p1:1:audio:a1', 'audio'], ['p1:1:video:v1', 'video']]);
  const result = reconcileSubscribedMids(responseTracks, newTransceiverMids, transceivers, kindMap, 'client-a');
  assert.equal(result.length, 2, 'both tracks should be reconciled');
  assert.equal(result[0].realMid, '2', 'audio gets first new transceiver mid');
  assert.equal(result[0].kind, 'audio', 'audio kind correct');
  assert.equal(result[0].trackName, 'p1:1:audio:a1', 'audio trackName preserved');
  assert.equal(result[0].publisherClientId, 'client-a', 'publisherClientId set');
  assert.equal(result[1].realMid, '3', 'video gets second new transceiver mid');
  assert.equal(result[1].kind, 'video', 'video kind correct');
  assert.equal(result[1].trackName, 'p1:1:video:v1', 'video trackName preserved');
}

// reconcileSubscribedMids — single track (screen only), no collision
{
  const responseTracks = [{ trackName: 'p2:1:screen:s1', mid: '' }];
  const newTransceiverMids = ['7'];
  const transceivers = makeTransceivers([{ mid: '7', receiverKind: 'video' }]);
  const kindMap = new Map([['p2:1:screen:s1', 'screen']]);
  const result = reconcileSubscribedMids(responseTracks, newTransceiverMids, transceivers, kindMap, 'client-b');
  assert.equal(result.length, 1);
  assert.equal(result[0].realMid, '7');
  assert.equal(result[0].kind, 'screen');
}

// reconcileSubscribedMids — maps positionally within each receiver kind rather than global response order
{
  const responseTracks = [
    { trackName: 'p3:1:video:v1', mid: '' },
    { trackName: 'p3:1:audio:a1', mid: '' },
  ];
  const newTransceiverMids = ['11', '12'];
  const transceivers = makeTransceivers([
    { mid: '11', receiverKind: 'audio' },
    { mid: '12', receiverKind: 'video' },
  ]);
  const kindMap = new Map([['p3:1:video:v1', 'video'], ['p3:1:audio:a1', 'audio']]);
  const result = reconcileSubscribedMids(responseTracks, newTransceiverMids, transceivers, kindMap, 'client-c');
  assert.equal(result.find((entry) => entry.trackName === 'p3:1:video:v1')?.realMid, '12', 'video maps to the video receiver mid');
  assert.equal(result.find((entry) => entry.trackName === 'p3:1:audio:a1')?.realMid, '11', 'audio maps to the audio receiver mid');
}

// reconcileSubscribedMids — same total count but per-kind drift fails loudly
{
  const responseTracks = [
    { trackName: 'p4:1:audio:a1', mid: '' },
    { trackName: 'p4:1:video:v1', mid: '' },
  ];
  const newTransceiverMids = ['21', '22'];
  const transceivers = makeTransceivers([
    { mid: '21', receiverKind: 'audio' },
    { mid: '22', receiverKind: 'audio' },
  ]);
  const kindMap = new Map([['p4:1:audio:a1', 'audio'], ['p4:1:video:v1', 'video']]);
  assert.throws(
    () => reconcileSubscribedMids(responseTracks, newTransceiverMids, transceivers, kindMap, 'client-d'),
    /per-kind|unexpected receiver kind/,
    'per-kind count drift should fail even when total counts match',
  );
}

// reconcileSubscribedMids — duplicate response trackName fails loudly
{
  const responseTracks = [
    { trackName: 'p5:1:audio:a1', mid: '' },
    { trackName: 'p5:1:audio:a1', mid: '' },
  ];
  const newTransceiverMids = ['31', '32'];
  const transceivers = makeTransceivers([
    { mid: '31', receiverKind: 'audio' },
    { mid: '32', receiverKind: 'audio' },
  ]);
  const kindMap = new Map([['p5:1:audio:a1', 'audio']]);
  assert.throws(
    () => reconcileSubscribedMids(responseTracks, newTransceiverMids, transceivers, kindMap, 'client-e'),
    /duplicate trackName/,
    'duplicate response trackNames should fail instead of silently mapping ambiguous tracks',
  );
}

console.log('sfu-client roster utils: all assertions passed');
