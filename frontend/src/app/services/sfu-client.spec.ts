import assert from 'node:assert/strict';
import '@angular/compiler';
import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { createEnvironmentInjector, runInInjectionContext } from '@angular/core';
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

function createSfuClient(http: Partial<HttpClient> = {}): SfuClientService {
  const injector = createEnvironmentInjector([
    { provide: HttpClient, useValue: http },
    { provide: IceConfigService, useValue: { getIceServers: async () => [] } },
    { provide: ViewportService, useValue: { isMobile: () => false } },
  ]);
  return runInInjectionContext(injector, () => new SfuClientService());
}

function withFakeTimers(run: (timers: { active: boolean; callback: () => void }[]) => void): void {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timers: { id: number; active: boolean; callback: () => void }[] = [];
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

function installPublishedSfuState(sfu: SfuClientService, pc: RTCPeerConnection): void {
  const privateSfu = sfu as unknown as {
    pc: RTCPeerConnection;
    callerCreds: { clientKey: string; participantId: string; sessionId: string };
  };
  privateSfu.pc = pc;
  privateSfu.callerCreds = { clientKey: 'ck', participantId: 'local-p', sessionId: 'room-1' };
  sfu.localPublishState.set({ cfSessionId: 'local-cf', status: 'published', tracks: [] });
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

// SFU-S1 — failed subscribe renegotiate restores touched mid entries, subscribedTracks, retry metadata, and rolls back PC.
{
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
    put: () => throwError(() => new Error('renegotiate failed')),
  } as unknown as Partial<HttpClient>;
  const sfu = createSfuClient(http);
  const pc = makeSubscribePc({ renegotiateFails: true });
  installPublishedSfuState(sfu, pc);

  const privateSfu = sfu as unknown as {
    doSubscribeTracks: (publisher: RemotePublisher, tracks: { trackName: string; kind: string }[]) => Promise<void>;
    midToEntry: Map<string, SubscribedTrackEntry>;
    subscribeRetryAttempts: Map<string, number>;
    subscribeFirstFrameAt: Map<string, number>;
  };
  const priorOverwritten: SubscribedTrackEntry = { publisherClientId: 'old-client', trackName: 'old-audio', kind: 'audio', mid: '2' };
  const priorUntouched: SubscribedTrackEntry = { publisherClientId: 'other-client', trackName: 'other-video', kind: 'video', mid: '9' };
  privateSfu.midToEntry.set('2', priorOverwritten);
  privateSfu.midToEntry.set('9', priorUntouched);
  sfu.subscribedTracks.set(
    new Map([
      ['2', priorOverwritten],
      ['9', priorUntouched],
    ]),
  );
  privateSfu.subscribeRetryAttempts.set('alice', 3);
  privateSfu.subscribeFirstFrameAt.set('alice', 1234);

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
  assert.equal(privateSfu.subscribeRetryAttempts.get('alice'), 3, 'failed subscribe restores prior retry attempts');
  assert.equal(privateSfu.subscribeFirstFrameAt.get('alice'), 1234, 'failed subscribe restores prior first-frame marker');
  assert.equal(pc.rollbackCount, 1, 'failed renegotiate attempts PC rollback');
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
  const pc = {
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
  } as unknown as RTCPeerConnection & { rollbackCount: number };
  installPublishedSfuState(sfu, pc);
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
