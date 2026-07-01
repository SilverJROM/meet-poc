import assert from 'node:assert/strict';
import '@angular/compiler';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { createEnvironmentInjector, runInInjectionContext, type EnvironmentInjector } from '@angular/core';
import { SfuClientService, type SubscribedTrackEntry } from './sfu-client.service.js';
import { IceConfigService } from './ice-config.service.js';
import { ViewportService } from './viewport.service.js';
import type { RemotePublisher } from './sfu-roster-utils.js';

// Focused unit tests for the B2a recovery coordinator (rung-1/rung-2 attempt shape) and the epoch guard
// (stale in-flight subscribe response must not bind after a local reset/rejoin bumps recoveryEpoch).
// The behavioral escalation/never-give-up proof lives in sfu-repro-harness.spec.ts; these tests are
// narrower — they pin the exact attempt counts, the forceRenegotiation flag per rung, and the epoch race.

type FakeTimer = { id: number; active: boolean; callback: () => void };

function createSfuClient(http: Partial<HttpClient> = {}): SfuClientService {
  const injector = createEnvironmentInjector(
    [
      { provide: HttpClient, useValue: http },
      {
        provide: IceConfigService,
        useValue: {
          getIceServers: async () => [],
          forceRefresh: async () => [],
          relayUnavailable: () => false,
        },
      },
      { provide: ViewportService, useValue: { isMobile: () => false } },
    ],
    undefined as unknown as EnvironmentInjector,
  );
  return runInInjectionContext(injector, () => new SfuClientService());
}

function withFakeTimersAsync(run: (timers: FakeTimer[]) => Promise<void>): Promise<void> {
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
  return run(timers).finally(() => {
    Object.defineProperty(globalThis, 'setTimeout', { configurable: true, value: originalSetTimeout });
    Object.defineProperty(globalThis, 'clearTimeout', { configurable: true, value: originalClearTimeout });
  });
}

function makeSingleTrackSubscribePc(): RTCPeerConnection {
  const transceivers = [{ mid: '0', receiver: { track: { kind: 'audio' } } }];
  return {
    signalingState: 'have-local-offer',
    localDescription: { type: 'offer', sdp: 'offer-sdp' },
    getTransceivers(): RTCRtpTransceiver[] {
      return transceivers as unknown as RTCRtpTransceiver[];
    },
    async setRemoteDescription(): Promise<void> {
      transceivers.push({ mid: '1', receiver: { track: { kind: 'audio' } } });
    },
    async createAnswer(): Promise<RTCSessionDescriptionInit> {
      return { type: 'answer', sdp: 'answer-sdp' };
    },
    async setLocalDescription(): Promise<void> {},
    close(): void {},
  } as unknown as RTCPeerConnection;
}

// Rung-3 rejoin tests subscribe MULTIPLE publishers sequentially onto the SAME mock pc — unlike
// makeSingleTrackSubscribePc (which always pushes a hardcoded mid '1'), this assigns a fresh
// incrementing mid per setRemoteDescription call so back-to-back subscribes don't collide.
function makeMultiSubscribePc(): RTCPeerConnection {
  let nextMid = 1;
  const transceivers = [{ mid: '0', receiver: { track: { kind: 'audio' } } }];
  return {
    signalingState: 'have-local-offer',
    localDescription: { type: 'offer', sdp: 'offer-sdp' },
    getTransceivers(): RTCRtpTransceiver[] {
      return transceivers as unknown as RTCRtpTransceiver[];
    },
    async setRemoteDescription(): Promise<void> {
      transceivers.push({ mid: `${nextMid}`, receiver: { track: { kind: 'audio' } } });
      nextMid += 1;
    },
    async createAnswer(): Promise<RTCSessionDescriptionInit> {
      return { type: 'answer', sdp: 'answer-sdp' };
    },
    async setLocalDescription(): Promise<void> {},
    close(): void {},
  } as unknown as RTCPeerConnection;
}

async function flushMicrotasks(times = 30): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

function installPublishedSfuState(sfu: SfuClientService, pc: RTCPeerConnection): void {
  const privateSfu = sfu as unknown as {
    pc: RTCPeerConnection;
    callerCreds: { clientKey: string; participantId: string; sessionId: string };
  };
  privateSfu.pc = pc;
  privateSfu.callerCreds = { clientKey: 'ck-local', participantId: 'p-local', sessionId: 'room-1' };
  sfu.localPublishState.set({ cfSessionId: 'local-cf', status: 'published', tracks: [] });
}

async function flushSfuQueue(sfu: SfuClientService): Promise<void> {
  const privateSfu = sfu as unknown as { opQueue: Promise<void> };
  await privateSfu.opQueue;
  await Promise.resolve();
  await privateSfu.opQueue;
  await Promise.resolve();
}

function fireNextActiveTimer(timers: FakeTimer[]): void {
  const timer = timers.find((entry) => entry.active);
  assert.ok(timer, 'expected an active fake timer');
  timer.active = false;
  timer.callback();
}

function makeBobPublisher(): RemotePublisher {
  return {
    clientId: 'bob',
    participantId: 'p-bob',
    cfSessionId: 'bob-cf',
    revision: 1,
    tracks: [{ trackName: 'bob-audio', kind: 'audio' }],
  };
}

function make406Error(): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 406,
    statusText: 'Not Acceptable',
    url: '/api/sfu/tracks',
    error: {
      errorDescription: 'session_not_found',
      errorCode: 'session_not_found',
      status: 406,
      endpoint: 'tracks',
      faultInjected: true,
    },
  });
}

// COORDINATOR-SHAPE — rung-1 fires exactly 3 same-session attempts (forceRenegotiation:false), then
// rung-2 fires exactly 2 forced-renegotiated attempts (forceRenegotiation:true), then needs-rejoin.
{
  await withFakeTimersAsync(async (timers) => {
    const forceRenegotiationFlags: boolean[] = [];
    const http = {
      post: (url: string, body: { forceRenegotiation?: boolean }) => {
        if (url !== '/api/sfu/tracks') return of({ sessionDescription: { type: 'answer', sdp: 'answer-sdp' } });
        forceRenegotiationFlags.push(body.forceRenegotiation === true);
        return throwError(() => make406Error());
      },
    } as unknown as Partial<HttpClient>;

    const sfu = createSfuClient(http);
    const pc = makeSingleTrackSubscribePc();
    installPublishedSfuState(sfu, pc);
    const publisher = makeBobPublisher();
    sfu.remotePublishers.set(new Map([[publisher.clientId, publisher]]));

    const privateSfu = sfu as unknown as { disarmSubscribeStuckWatchdog: (publisherClientId: string) => void };
    sfu.subscribeIfNeeded(publisher);

    const rungs: string[] = [];
    for (let round = 0; round < 20; round += 1) {
      await flushSfuQueue(sfu);
      privateSfu.disarmSubscribeStuckWatchdog(publisher.clientId);
      const event = sfu.lastRecoveryEvent();
      const lastRung = rungs[rungs.length - 1];
      if (event && event.publisherClientId === publisher.clientId && `${event.rung}:${event.attempt}` !== lastRung) {
        rungs.push(`${event.rung}:${event.attempt}`);
        if (event.rung === 'needs-rejoin') break;
      }
      const active = timers.filter((t) => t.active);
      if (!active.length) throw new Error('COORDINATOR-SHAPE: no active timer before needs-rejoin');
      fireNextActiveTimer(timers);
    }

    assert.deepEqual(
      rungs,
      ['subscribe-retry:1', 'subscribe-retry:2', 'subscribe-retry:3', 'subscribe-renegotiate:1', 'subscribe-renegotiate:2', 'needs-rejoin:3'],
      'COORDINATOR-SHAPE: exact rung sequence — 3 same-session retries, then 2 forced-renegotiated retries, then needs-rejoin',
    );
    // 1 initial attempt (subscribeIfNeeded) + 3 rung-1 + 2 rung-2 = 6 POSTs before needs-rejoin.
    assert.deepEqual(
      forceRenegotiationFlags,
      [false, false, false, false, true, true],
      'COORDINATOR-SHAPE: forceRenegotiation is false for the initial+rung-1 attempts and true for both rung-2 attempts',
    );

    sfu.destroy();
  });
}

// EPOCH-GUARD — a subscribe response that resolves AFTER a local reset/rejoin bumped recoveryEpoch must
// not bind (B0 consensus stale-in-flight-op case): the epoch is captured at trigger time, not at bind time.
{
  const pending: { resolve: (value: { tracks: { trackName: string; mid: string }[] }) => void }[] = [];
  const http = {
    post: (url: string) => {
      if (url !== '/api/sfu/tracks') return of({ sessionDescription: { type: 'answer', sdp: 'answer-sdp' } });
      return new Observable<{ tracks: { trackName: string; mid: string }[] }>((subscriber) => {
        pending.push({
          resolve: (value) => {
            subscriber.next(value);
            subscriber.complete();
          },
        });
      });
    },
  } as unknown as Partial<HttpClient>;

  const sfu = createSfuClient(http);
  const pc = makeSingleTrackSubscribePc();
  installPublishedSfuState(sfu, pc);
  const publisher = makeBobPublisher();
  sfu.remotePublishers.set(new Map([[publisher.clientId, publisher]]));

  sfu.subscribeIfNeeded(publisher);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(pending.length, 1, 'EPOCH-GUARD: subscribe POST is in flight, awaiting manual resolution');

  // Simulate a local reset/rejoin happening while the POST above is still in flight.
  const privateSfu = sfu as unknown as { recoveryEpoch: number };
  privateSfu.recoveryEpoch += 1;

  // Resolve the stale (pre-bump) POST with a would-otherwise-bind response.
  pending[0].resolve({ tracks: [{ trackName: 'bob-audio', mid: '1' }] });
  await flushSfuQueue(sfu);

  assert.equal(
    sfu.subscribedTracks().size,
    0,
    'EPOCH-GUARD: stale in-flight subscribe response does not bind after recoveryEpoch changed underneath it',
  );

  sfu.destroy();
}

// MID-CALL-NEVER-GIVES-UP — a NEW audio track advertised mid-call (a peer unmuting after joining, the
// HRIS_TOJ pattern) that exhausts the legacy mid-call retry cap must escalate into the shared
// low-frequency continuation, not permanently stop (SEND-BACK iter 1 correction). Fires the armed timer
// to prove it actually keeps retrying — safe here since this file is small and fake-timed throughout.
{
  await withFakeTimersAsync(async (timers) => {
    const sfu = createSfuClient();
    const pc = makeSingleTrackSubscribePc();
    installPublishedSfuState(sfu, pc);
    const publisher: RemotePublisher = {
      clientId: 'alice',
      participantId: 'p-alice',
      cfSessionId: 'alice-cf',
      revision: 2,
      tracks: [{ trackName: 'alice-audio', kind: 'audio' }],
    };
    sfu.remotePublishers.set(new Map([['alice', publisher]]));

    const privateSfu = sfu as unknown as {
      subscribeNewRemoteTracks: (publisher: RemotePublisher, previousTracks: { trackName: string; kind: string }[]) => void;
      doSubscribeTracks: (...args: unknown[]) => Promise<void>;
      midCallSubscribeRetryKey: (clientId: string, cfSessionId: string, trackName: string) => string;
      midCallSubscribeRetryAttempts: Map<string, number>;
      subscribeRecoveryLowFreqTimers: Map<string, unknown>;
      disarmSubscribeStuckWatchdog: (publisherClientId: string) => void;
    };
    const key = privateSfu.midCallSubscribeRetryKey('alice', 'alice-cf', 'alice-audio');
    privateSfu.midCallSubscribeRetryAttempts.set(key, 7); // at the legacy cap boundary
    let doSubscribeCalls = 0;
    privateSfu.doSubscribeTracks = async () => {
      doSubscribeCalls += 1;
      throw new Error('persistent failure');
    };

    privateSfu.subscribeNewRemoteTracks(publisher, []);
    await flushSfuQueue(sfu);
    privateSfu.disarmSubscribeStuckWatchdog('alice');

    assert.equal(sfu.lastRecoveryEvent()?.rung, 'needs-rejoin', 'MID-CALL-NEVER-GIVES-UP: cap exhaustion emits needs-rejoin');
    assert.equal(privateSfu.subscribeRecoveryLowFreqTimers.has('alice'), true, 'MID-CALL-NEVER-GIVES-UP: low-frequency continuation is armed');

    const callsBeforeCycle = doSubscribeCalls;
    const lowFreqTimer = timers.find((timer) => timer.active);
    assert.ok(lowFreqTimer, 'MID-CALL-NEVER-GIVES-UP: low-frequency timer is active');
    lowFreqTimer!.active = false;
    lowFreqTimer!.callback();
    await flushSfuQueue(sfu);
    privateSfu.disarmSubscribeStuckWatchdog('alice');

    assert.ok(doSubscribeCalls > callsBeforeCycle, 'MID-CALL-NEVER-GIVES-UP: low-frequency cycle retries the subscribe again — never permanently stops');
    assert.equal(privateSfu.subscribeRecoveryLowFreqTimers.has('alice'), true, 'MID-CALL-NEVER-GIVES-UP: low-frequency continuation re-arms itself');

    sfu.destroy();
    assert.equal(privateSfu.subscribeRecoveryLowFreqTimers.size, 0, 'MID-CALL-NEVER-GIVES-UP: destroy() clears all armed timers — no leaked state');
  });
}

// LIVE-MID-CONFLICT-FALLBACK-NEVER-GIVES-UP — the live-mid-conflict retry's OWN cap (2 forced-renegotiation
// attempts) exhausts while the peer is still admitted+advertising. Both the fallback catch's legacy
// nextSubscribeRetry() AND scheduleLiveMidConflictRenegotiationRetry's own cap must escalate into the
// shared low-frequency continuation instead of leaving subscribedClientIds latched (SEND-BACK iter 2).
{
  await withFakeTimersAsync(async (timers) => {
    let postCalls = 0;
    const http = {
      // Always claims mid '1', which stays occupied by 'existing-pub' (still in remotePublishers) —
      // every attempt (initial + both forced-renegotiation retries) hits a live mid conflict.
      post: () => {
        postCalls += 1;
        return of({ tracks: [{ trackName: 'bob-audio', mid: '1' }] });
      },
    } as unknown as Partial<HttpClient>;

    const sfu = createSfuClient(http);
    const pc = makeSingleTrackSubscribePc();
    installPublishedSfuState(sfu, pc);

    const existingEntry: SubscribedTrackEntry = { publisherClientId: 'existing-pub', trackName: 'existing-audio', kind: 'audio', mid: '1' };
    const privateSfu = sfu as unknown as {
      midToEntry: Map<string, SubscribedTrackEntry>;
      disarmSubscribeStuckWatchdog: (publisherClientId: string) => void;
      subscribeRecoveryLowFreqTimers: Map<string, unknown>;
    };
    privateSfu.midToEntry.set('1', existingEntry);
    sfu.subscribedTracks.set(new Map([['1', existingEntry]]));

    const bob = makeBobPublisher();
    sfu.remotePublishers.set(
      new Map([
        ['existing-pub', { clientId: 'existing-pub', participantId: 'p-existing', cfSessionId: 'existing-cf', revision: 1, tracks: [{ trackName: 'existing-audio', kind: 'audio' }] }],
        ['bob', bob],
      ]),
    );

    sfu.subscribeIfNeeded(bob);
    await flushSfuQueue(sfu);
    privateSfu.disarmSubscribeStuckWatchdog('bob');

    // Fire the conflict-retry timer twice more: attempt 1 (initial) -> 2 -> 3 exceeds
    // LIVE_MID_CONFLICT_RENEGOTIATION_CAP (2), reaching cap-exhaust on the 3rd conflict.
    for (let round = 0; round < 2; round += 1) {
      const timer = timers.find((t) => t.active);
      assert.ok(timer, `LIVE-MID-CONFLICT-FALLBACK: conflict-retry timer active before round ${round + 1}`);
      timer!.active = false;
      timer!.callback();
      await flushSfuQueue(sfu);
      privateSfu.disarmSubscribeStuckWatchdog('bob');
    }

    assert.equal(postCalls, 3, 'LIVE-MID-CONFLICT-FALLBACK: exactly 3 POSTs (initial + 2 forced-renegotiation retries) before cap-exhaust');
    assert.equal(sfu.lastRecoveryEvent()?.rung, 'needs-rejoin', 'LIVE-MID-CONFLICT-FALLBACK: cap-exhaust emits needs-rejoin instead of a silent permanent stop');
    assert.equal(sfu.lastRecoveryEvent()?.publisherClientId, 'bob', 'LIVE-MID-CONFLICT-FALLBACK: needs-rejoin is scoped to the exhausted publisher');
    assert.equal(privateSfu.subscribeRecoveryLowFreqTimers.has('bob'), true, 'LIVE-MID-CONFLICT-FALLBACK: low-frequency continuation is armed — never a permanent stop');

    const callsBeforeCycle = postCalls;
    const lowFreqTimer = timers.find((t) => t.active);
    assert.ok(lowFreqTimer, 'LIVE-MID-CONFLICT-FALLBACK: low-frequency timer is active');
    lowFreqTimer!.active = false;
    lowFreqTimer!.callback();
    await flushSfuQueue(sfu);
    privateSfu.disarmSubscribeStuckWatchdog('bob');

    assert.ok(postCalls > callsBeforeCycle, 'LIVE-MID-CONFLICT-FALLBACK: low-frequency cycle retries the subscribe again — never permanently stops');
    assert.equal(privateSfu.subscribeRecoveryLowFreqTimers.has('bob'), true, 'LIVE-MID-CONFLICT-FALLBACK: low-frequency continuation re-arms itself');

    sfu.destroy();
    assert.equal(privateSfu.subscribeRecoveryLowFreqTimers.size, 0, 'LIVE-MID-CONFLICT-FALLBACK: destroy() clears all armed timers — no leaked state');
  });
}

// B2b — rung-3 full local SFU rejoin coordinator (coalescing lock, ≤1/15s + ≤2/2min throttle, epoch
// safety across the rotation, resubscribe-ALL-advertised — not just the trigger publisher). These reuse
// the SAME resetForTransportRecovery()+transportRecoveryHandler production path via a mocked handler
// (installPublishedSfuState simulates a completed republish) so the coalescing/throttle/resubscribe
// wrapper is proven without driving doPublish's real HTTP flow.

// COALESCING + RESUBSCRIBE-ALL — bob and alice both exhaust rung-2 in the same synchronous tick (two
// needs-rejoin triggers, no await between them) → exactly ONE full rejoin, and the rejoin resubscribes
// EVERY advertised publisher afterward (not only the one whose exhaustion triggered it) — the rotation
// drops every existing subscription, so a previously-healthy peer must come back too (elite-redteam #1).
{
  const postCalls: string[] = [];
  const http = {
    post: (url: string, body: { tracks?: { trackName: string }[] }) => {
      if (url !== '/api/sfu/tracks') throw new Error(`REJOIN-RESUBSCRIBE-ALL: unexpected POST ${url}`);
      const trackName = body.tracks?.[0]?.trackName ?? 'unknown';
      postCalls.push(trackName);
      return of({ tracks: [{ trackName, mid: '' }] });
    },
  } as unknown as Partial<HttpClient>;

  const sfu = createSfuClient(http);
  const pc = makeMultiSubscribePc();
  installPublishedSfuState(sfu, pc);

  const bob = makeBobPublisher();
  const alice: RemotePublisher = {
    clientId: 'alice',
    participantId: 'p-alice',
    cfSessionId: 'alice-cf',
    revision: 1,
    tracks: [{ trackName: 'alice-audio', kind: 'audio' }],
  };
  sfu.remotePublishers.set(new Map([[bob.clientId, bob], [alice.clientId, alice]]));

  let handlerCalls = 0;
  sfu.setTransportRecoveryHandler(async () => {
    handlerCalls += 1;
    installPublishedSfuState(sfu, pc); // simulate a completed full republish (fresh session, same mock pc)
  });

  const privateSfu = sfu as unknown as {
    subscribeRecoveryRung1Attempts: Map<string, number>;
    subscribeRecoveryRung2Attempts: Map<string, number>;
    scheduleRecoveryEscalation: (clientId: string, hasFirstFrame: boolean) => void;
    rejoinScheduled: boolean;
  };
  // Pre-seed both publishers at the rung-1/rung-2 cap boundary so a single scheduleRecoveryEscalation
  // call for each lands directly on "rung-2 exhausted" → needs-rejoin, synchronously, in the same tick.
  for (const clientId of ['bob', 'alice']) {
    privateSfu.subscribeRecoveryRung1Attempts.set(clientId, 3);
    privateSfu.subscribeRecoveryRung2Attempts.set(clientId, 2);
  }

  privateSfu.scheduleRecoveryEscalation('bob', false);
  privateSfu.scheduleRecoveryEscalation('alice', false);

  await flushMicrotasks();

  assert.equal(handlerCalls, 1, 'COALESCING: two same-tick needs-rejoin triggers cause exactly one full rejoin, not two');
  assert.deepEqual(
    postCalls.slice().sort(),
    ['alice-audio', 'bob-audio'],
    'RESUBSCRIBE-ALL: the rejoin resubscribes every advertised publisher, not only the one that triggered it',
  );
  assert.equal(privateSfu.rejoinScheduled, false, 'COALESCING: the lock releases once the rejoin completes');

  sfu.destroy();
}

// NO-DUPLICATE-SUBSCRIBE — if a publisher is already claimed by a racing subscribe path (e.g. a
// handleSfuPresence-driven direct subscribeIfNeeded landing concurrently on the fresh session) by the
// time subscribeAllAdvertisedRemotes reaches it, the rejoin must skip it rather than double-POST
// (elite-redteam #2: no duplicate subscriptions surviving the rotation).
{
  const postCalls: string[] = [];
  const http = {
    post: (url: string, body: { tracks?: { trackName: string }[] }) => {
      if (url !== '/api/sfu/tracks') throw new Error(`NO-DUPLICATE-SUBSCRIBE: unexpected POST ${url}`);
      const trackName = body.tracks?.[0]?.trackName ?? 'unknown';
      postCalls.push(trackName);
      return of({ tracks: [{ trackName, mid: '' }] });
    },
  } as unknown as Partial<HttpClient>;

  const sfu = createSfuClient(http);
  const pc = makeMultiSubscribePc();
  installPublishedSfuState(sfu, pc);

  const bob = makeBobPublisher();
  const alice: RemotePublisher = {
    clientId: 'alice',
    participantId: 'p-alice',
    cfSessionId: 'alice-cf',
    revision: 1,
    tracks: [{ trackName: 'alice-audio', kind: 'audio' }],
  };
  sfu.remotePublishers.set(new Map([[bob.clientId, bob], [alice.clientId, alice]]));

  sfu.setTransportRecoveryHandler(async () => {
    installPublishedSfuState(sfu, pc);
    // Simulate the race: alice's guard is already claimed by another in-flight subscribe path on the
    // same fresh epoch by the time our loop would reach her.
    (sfu as unknown as { subscribedClientIds: Set<string> }).subscribedClientIds.add('alice');
  });

  const privateSfu = sfu as unknown as { handleNeedsRejoinTrigger: () => void };
  privateSfu.handleNeedsRejoinTrigger();
  await flushMicrotasks();

  assert.deepEqual(
    postCalls,
    ['bob-audio'],
    'NO-DUPLICATE-SUBSCRIBE: a publisher already claimed by a racing subscribe path is skipped, not double-subscribed',
  );

  sfu.destroy();
}

// EPOCH-SAFETY-DURING-REJOIN — a rejoin whose republish is still in flight gets superseded by an
// unrelated concurrent reset (recoveryEpoch bumped underneath it): the rejoin must NOT resubscribe on
// the now-stale epoch once its republish resolves (elite-redteam: no ghost/duplicate binds across a
// rotation race).
{
  const pendingRepublish: { resolve: () => void }[] = [];
  const sfu = createSfuClient();
  const pc = makeSingleTrackSubscribePc();
  installPublishedSfuState(sfu, pc);
  const bob = makeBobPublisher();
  sfu.remotePublishers.set(new Map([[bob.clientId, bob]]));

  sfu.setTransportRecoveryHandler(
    () =>
      new Promise<void>((resolve) => {
        pendingRepublish.push({
          resolve: () => {
            installPublishedSfuState(sfu, pc);
            resolve();
          },
        });
      }),
  );

  const privateSfu = sfu as unknown as {
    handleNeedsRejoinTrigger: () => void;
    recoveryEpoch: number;
    doSubscribeTracks: (...args: unknown[]) => Promise<void>;
  };
  let subscribeCalls = 0;
  privateSfu.doSubscribeTracks = async () => {
    subscribeCalls += 1;
  };

  privateSfu.handleNeedsRejoinTrigger();
  await flushMicrotasks();
  assert.equal(pendingRepublish.length, 1, 'EPOCH-SAFETY-DURING-REJOIN: republish handler is in flight');

  // An unrelated reset (e.g. a second overlapping rejoin, or ICE transport recovery) lands while our
  // rejoin's republish is still pending.
  privateSfu.recoveryEpoch += 1;

  pendingRepublish[0].resolve();
  await flushMicrotasks();

  assert.equal(
    subscribeCalls,
    0,
    'EPOCH-SAFETY-DURING-REJOIN: a rejoin superseded by a newer reset mid-flight must not resubscribe on the stale epoch',
  );

  sfu.destroy();
}

// THROTTLE — ≤1 full rejoin/15s AND ≤2/2min; once exceeded, rung-4's visible unrecovered state is set,
// and it clears again the moment a fresh (non-throttled) rejoin actually fires. nowMs() is overridden
// (not real Date/setTimeout) so the 15s/2min windows are deterministic without real elapsed time.
{
  const sfu = createSfuClient();
  const pc = makeSingleTrackSubscribePc();
  installPublishedSfuState(sfu, pc);

  let handlerCalls = 0;
  sfu.setTransportRecoveryHandler(async () => {
    handlerCalls += 1;
    installPublishedSfuState(sfu, pc);
  });

  const privateSfu = sfu as unknown as { handleNeedsRejoinTrigger: () => void; nowMs: () => number };
  let simulatedNow = 0;
  privateSfu.nowMs = () => simulatedNow;

  privateSfu.handleNeedsRejoinTrigger();
  await flushMicrotasks();
  assert.equal(handlerCalls, 1, 'THROTTLE: the first rejoin proceeds');
  assert.equal(sfu.sfuRejoinThrottled(), false, 'THROTTLE: not throttled after the 1st rejoin');

  simulatedNow += 5_000; // +5s: inside the 15s window
  privateSfu.handleNeedsRejoinTrigger();
  await flushMicrotasks();
  assert.equal(handlerCalls, 1, 'THROTTLE: a 2nd rejoin inside the 15s window is blocked');
  assert.equal(sfu.sfuRejoinThrottled(), true, 'THROTTLE: rung-4 visible-unrecovered state set once the 15s cap is hit');
  assert.equal(sfu.lastRecoveryEvent()?.rung, 'unrecovered-visible', 'THROTTLE: unrecovered-visible rung emitted on cap-exceeded');

  simulatedNow += 20_000; // +25s total: past 15s, still inside 2min
  privateSfu.handleNeedsRejoinTrigger();
  await flushMicrotasks();
  assert.equal(handlerCalls, 2, 'THROTTLE: a 2nd real rejoin proceeds once past the 15s window');
  assert.equal(sfu.sfuRejoinThrottled(), false, 'THROTTLE: throttled flag clears once a fresh rejoin actually fires');

  simulatedNow += 20_000; // +45s total: still inside 2min, 2 rejoins already fired in that window
  privateSfu.handleNeedsRejoinTrigger();
  await flushMicrotasks();
  assert.equal(handlerCalls, 2, 'THROTTLE: a 3rd rejoin inside the 2min window (2 already fired) is blocked by the <=2/2min cap');
  assert.equal(sfu.sfuRejoinThrottled(), true, 'THROTTLE: still visibly unrecovered while capped');

  simulatedNow += 180_000; // +225s total: past the 2min window
  privateSfu.handleNeedsRejoinTrigger();
  await flushMicrotasks();
  assert.equal(handlerCalls, 3, 'THROTTLE: once the 2min window clears, rejoin proceeds again — never a permanent stop');
  assert.equal(sfu.sfuRejoinThrottled(), false, 'THROTTLE: unrecovered state clears again once the rejoin fires');

  sfu.destroy();
}

console.log('sfu-recovery-coordinator: all assertions passed');
