import assert from 'node:assert/strict';
import '@angular/compiler';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { createEnvironmentInjector, runInInjectionContext, type EnvironmentInjector } from '@angular/core';
import { SfuClientService } from './sfu-client.service.js';
import { IceConfigService } from './ice-config.service.js';
import { ViewportService } from './viewport.service.js';
import type { RemotePublisher } from './sfu-roster-utils.js';
import {
  isLastGumErrorCandidate,
  remotePublisherDiagnosticsQuality,
} from './sfu-subscribe-failure-evidence.js';

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
  } as unknown as RTCPeerConnection;
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

async function driveSubscribeUntilCapGiveUp(sfu: SfuClientService, timers: FakeTimer[], publisher: RemotePublisher): Promise<number> {
  const privateSfu = sfu as unknown as {
    subscribedClientIds: Set<string>;
    subscribeRetryAttempts: Map<string, number>;
    disarmSubscribeStuckWatchdog: (publisherClientId: string) => void;
  };
  let postCalls = 0;
  const maxRounds = 24;

  for (let round = 0; round < maxRounds; round += 1) {
    await flushSfuQueue(sfu);
    privateSfu.disarmSubscribeStuckWatchdog(publisher.clientId);

    if ((privateSfu.subscribeRetryAttempts.get(publisher.clientId) ?? 0) > 7) {
      return postCalls;
    }

    if (!privateSfu.subscribedClientIds.has(publisher.clientId)) {
      sfu.subscribeIfNeeded(publisher);
      postCalls += 1;
      await flushSfuQueue(sfu);
    }

    const activeTimers = timers.filter((timer) => timer.active);
    if (!activeTimers.length) {
      if ((privateSfu.subscribeRetryAttempts.get(publisher.clientId) ?? 0) > 7) return postCalls;
      sfu.subscribeIfNeeded(publisher);
      postCalls += 1;
      await flushSfuQueue(sfu);
      continue;
    }

    fireNextActiveTimer(timers);
    if (!privateSfu.subscribedClientIds.has(publisher.clientId)) {
      sfu.subscribeIfNeeded(publisher);
      postCalls += 1;
    }
  }

  throw new Error('driveSubscribeUntilCapGiveUp exceeded max rounds');
}

function settleFakeTimers(timers: FakeTimer[]): void {
  for (let guard = 0; guard < timers.length + 4; guard += 1) {
    const active = timers.filter((timer) => timer.active);
    if (!active.length) return;
    for (const timer of active) {
      timer.active = false;
      timer.callback();
    }
  }
}

function assertGiveUpOutcome(
  sfu: SfuClientService,
  publisher: RemotePublisher,
  postCallsAtCap: number,
  httpPost: { calls: number },
): void {
  const privateSfu = sfu as unknown as {
    subscribedClientIds: Set<string>;
    subscribeRetryAttempts: Map<string, number>;
    subscribeBackoffTimers: Set<unknown>;
    subscribeStuckTimers: Map<string, unknown>;
  };
  const quality = remotePublisherDiagnosticsQuality(publisher, sfu.subscribedTracks().values());
  const retryVersionBefore = sfu.subscribeRetryVersion();

  assert.equal(quality, 'advertised-not-subscribed', 'BUG-REPRO-R1: peer remains advertised-not-subscribed after give-up');
  assert.equal([...sfu.subscribedTracks().values()].some((entry) => entry.publisherClientId === publisher.clientId), false, 'BUG-REPRO-R1: no subscribed track entry after give-up');
  assert.equal(privateSfu.subscribedClientIds.has(publisher.clientId), true, 'BUG-REPRO-R1: subscribe guard stays latched after cap');
  assert.ok((privateSfu.subscribeRetryAttempts.get(publisher.clientId) ?? 0) > 7, 'BUG-REPRO-R1: subscribe retry attempts remain above cap after give-up');
  assert.equal(privateSfu.subscribeStuckTimers.size, 0, 'BUG-REPRO-R1: stuck watchdog disarmed or inactive after cap');

  for (let poll = 0; poll < 3; poll += 1) {
    const callsBefore = httpPost.calls;
    sfu.subscribeIfNeeded(publisher);
    assert.equal(httpPost.calls, callsBefore, `BUG-REPRO-R1: polled subscribeIfNeeded attempt ${poll + 1} does not issue another POST after cap`);
    assert.equal(
      remotePublisherDiagnosticsQuality(publisher, sfu.subscribedTracks().values()),
      'advertised-not-subscribed',
      `BUG-REPRO-R1: polled quality attempt ${poll + 1} stays advertised-not-subscribed`,
    );
  }

  assert.equal(sfu.subscribeRetryVersion(), retryVersionBefore, 'BUG-REPRO-R1: subscribeRetryVersion stable after give-up polling');
  assert.equal(httpPost.calls, postCallsAtCap, 'BUG-REPRO-R1: no additional HTTP subscribe calls after cap');
}

// BUG-REPRO-R1-406-subscribe-cap-give-up — forced /api/sfu/tracks 406 exhausts subscribe retries and permanently latches give-up.
{
  await withFakeTimersAsync(async (timers) => {
    const httpPost = { calls: 0 };
    const http = {
      post: (url: string) => {
        if (url !== '/api/sfu/tracks') return of({ sessionDescription: { type: 'answer', sdp: 'answer-sdp' } });
        httpPost.calls += 1;
        return throwError(() => make406Error());
      },
    } as unknown as Partial<HttpClient>;

    const sfu = createSfuClient(http);
    const pc = makeSingleTrackSubscribePc();
    installPublishedSfuState(sfu, pc);
    const publisher = makeBobPublisher();
    sfu.remotePublishers.set(new Map([[publisher.clientId, publisher]]));

    const postCallsAtCap = await driveSubscribeUntilCapGiveUp(sfu, timers, publisher);
    await flushSfuQueue(sfu);
    settleFakeTimers(timers);
    await flushSfuQueue(sfu);
    assert.ok(postCallsAtCap >= 7, 'BUG-REPRO-R1-406: subscribe POST attempts exhaust retry budget before permanent stop');

    assertGiveUpOutcome(sfu, publisher, postCallsAtCap, httpPost);
  });
}

// BUG-REPRO-R1-advertised-not-subscribed-stuck-give-up — subscribe POST hangs without first frame until stuck watchdog caps into the same give-up.
{
  await withFakeTimersAsync(async (timers) => {
    let postCalls = 0;
    const http = {
      post: (url: string) => {
        if (url !== '/api/sfu/tracks') return of({ sessionDescription: { type: 'answer', sdp: 'answer-sdp' } });
        postCalls += 1;
        return throwError(() => new Error('subscribe transport unavailable'));
      },
    } as unknown as Partial<HttpClient>;

    const sfu = createSfuClient(http);
    const pc = makeSingleTrackSubscribePc();
    installPublishedSfuState(sfu, pc);
    const publisher = makeBobPublisher();
    sfu.remotePublishers.set(new Map([[publisher.clientId, publisher]]));

    const postCallsAtCap = await driveSubscribeUntilCapGiveUp(sfu, timers, publisher);
    await flushSfuQueue(sfu);
    settleFakeTimers(timers);
    await flushSfuQueue(sfu);
    assert.ok(postCallsAtCap >= 7, 'BUG-REPRO-R1-stuck: subscribe attempts reach cap via retry/stuck path');

    assertGiveUpOutcome(sfu, publisher, postCalls, { calls: postCalls });
  });
}

// BUG-REPRO-R1-406-evidence-not-gum-error — 406 evidence fields are recorded and are not GUM/getUserMedia errors.
{
  await withFakeTimersAsync(async (timers) => {
    const http = {
      post: (url: string) => {
        if (url !== '/api/sfu/tracks') return of({ sessionDescription: { type: 'answer', sdp: 'answer-sdp' } });
        return throwError(() => make406Error());
      },
    } as unknown as Partial<HttpClient>;

    const sfu = createSfuClient(http);
    const pc = makeSingleTrackSubscribePc();
    installPublishedSfuState(sfu, pc);
    const publisher = makeBobPublisher();
    sfu.remotePublishers.set(new Map([[publisher.clientId, publisher]]));

    sfu.subscribeIfNeeded(publisher);
    await flushSfuQueue(sfu);

    const evidence = sfu.lastSubscribeFailureEvidence();
    assert.ok(evidence, 'BUG-REPRO-R1-406-evidence: subscribe failure evidence is recorded');
    assert.equal(evidence?.httpStatus, 406, 'BUG-REPRO-R1-406-evidence: httpStatus captured');
    assert.equal(evidence?.errorCode, 'session_not_found', 'BUG-REPRO-R1-406-evidence: errorCode captured');
    assert.equal(evidence?.errorDescription, 'session_not_found', 'BUG-REPRO-R1-406-evidence: errorDescription captured');
    assert.equal(evidence?.endpoint, 'POST /api/sfu/tracks', 'BUG-REPRO-R1-406-evidence: endpoint captured');
    assert.equal(evidence?.operation, 'subscribe', 'BUG-REPRO-R1-406-evidence: operation captured as subscribe');
    assert.equal(evidence?.localCfSessionId, 'local-cf', 'BUG-REPRO-R1-406-evidence: local cfSessionId captured');
    assert.equal(evidence?.remoteCfSessionId, 'bob-cf', 'BUG-REPRO-R1-406-evidence: remote cfSessionId captured');
    assert.equal(evidence?.publisherClientId, 'bob', 'BUG-REPRO-R1-406-evidence: publisher clientId captured');
    assert.equal(evidence?.publisherParticipantId, 'p-bob', 'BUG-REPRO-R1-406-evidence: publisher participantId captured');
    assert.deepEqual(evidence?.trackNames, ['bob-audio'], 'BUG-REPRO-R1-406-evidence: track names captured');
    assert.equal(evidence?.pcSignalingState, 'have-local-offer', 'BUG-REPRO-R1-406-evidence: pc.signalingState captured');
    assert.equal(isLastGumErrorCandidate(make406Error()), false, 'BUG-REPRO-R1-406-evidence: 406 is not a GUM error candidate');

    await driveSubscribeUntilCapGiveUp(sfu, timers, publisher);
    const finalEvidence = sfu.lastSubscribeFailureEvidence();
    assert.ok(finalEvidence, 'BUG-REPRO-R1-406-evidence: evidence remains available after cap give-up');
    assert.equal(finalEvidence?.httpStatus, 406, 'BUG-REPRO-R1-406-evidence: final evidence retains httpStatus 406');
    assert.equal(isLastGumErrorCandidate(make406Error()), false, 'BUG-REPRO-R1-406-evidence: subscribe 406 must never be classified as GUM');
  });
}

console.log('sfu-repro-harness: all assertions passed');