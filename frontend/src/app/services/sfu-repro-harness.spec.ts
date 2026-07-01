import assert from 'node:assert/strict';
import '@angular/compiler';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { createEnvironmentInjector, runInInjectionContext, type EnvironmentInjector } from '@angular/core';
import { SfuClientService, type SfuRecoveryDiagnosticsEvent } from './sfu-client.service.js';
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

// Drives the recovery ladder (rung-1 same-session retry → rung-2 forced renegotiated retry) by firing
// each scheduled backoff timer in turn until the coordinator emits `needs-rejoin` (rung-2 exhausted,
// B2b's rung-3 rejoin not yet wired). Disarms the 10s stuck watchdog each round so the fake-timer queue
// only ever contains the ladder's own backoff timers — deterministic, no reliance on real elapsed time.
async function driveSubscribeRecoveryUntilNeedsRejoin(
  sfu: SfuClientService,
  timers: FakeTimer[],
  publisher: RemotePublisher,
): Promise<SfuRecoveryDiagnosticsEvent[]> {
  const privateSfu = sfu as unknown as {
    disarmSubscribeStuckWatchdog: (publisherClientId: string) => void;
  };
  const events: SfuRecoveryDiagnosticsEvent[] = [];
  const maxRounds = 40;

  for (let round = 0; round < maxRounds; round += 1) {
    await flushSfuQueue(sfu);
    privateSfu.disarmSubscribeStuckWatchdog(publisher.clientId);

    const event = sfu.lastRecoveryEvent();
    const last = events[events.length - 1];
    if (event && event.publisherClientId === publisher.clientId && (!last || last.rung !== event.rung || last.attempt !== event.attempt)) {
      events.push(event);
      if (event.rung === 'needs-rejoin') return events;
    }

    const activeTimers = timers.filter((timer) => timer.active);
    if (!activeTimers.length) {
      throw new Error('driveSubscribeRecoveryUntilNeedsRejoin: no active timer and needs-rejoin not yet observed');
    }
    fireNextActiveTimer(timers);
  }

  throw new Error('driveSubscribeRecoveryUntilNeedsRejoin exceeded max rounds');
}

// Was assertGiveUpOutcome (asserted the permanent-stop cap-give-up bug). B2a replaces the terminal
// give-up with escalation: rung-1 → rung-2 → needs-rejoin, and asserts the never-give-up invariant by
// proving the low-frequency continuation keeps firing (see the per-test cycles after this call).
function assertEscalationOutcome(sfu: SfuClientService, publisher: RemotePublisher, events: SfuRecoveryDiagnosticsEvent[]): void {
  const privateSfu = sfu as unknown as { subscribedClientIds: Set<string> };
  const quality = remotePublisherDiagnosticsQuality(publisher, sfu.subscribedTracks().values());

  assert.equal(quality, 'advertised-not-subscribed', 'RECOVERY-LADDER: peer remains advertised-not-subscribed while the ladder escalates');
  assert.equal(
    [...sfu.subscribedTracks().values()].some((entry) => entry.publisherClientId === publisher.clientId),
    false,
    'RECOVERY-LADDER: no subscribed track entry bound (mock always 406s)',
  );

  const retryEvents = events.filter((e) => e.rung === 'subscribe-retry');
  const renegotiateEvents = events.filter((e) => e.rung === 'subscribe-renegotiate');
  const needsRejoinEvents = events.filter((e) => e.rung === 'needs-rejoin');
  assert.ok(retryEvents.length >= 3, 'RECOVERY-LADDER: rung-1 same-session retry fired its bound 3 attempts');
  assert.ok(renegotiateEvents.length >= 2, 'RECOVERY-LADDER: rung-2 forced-renegotiated retry fired its bound 2 attempts');
  assert.equal(needsRejoinEvents.length, 1, 'RECOVERY-LADDER: needs-rejoin fires exactly once when rung-2 exhausts');

  // NOT a permanent stop: unlike the old give-up bug, the guard is not left latched with no further
  // activity — the low-frequency continuation (asserted by the caller) keeps retrying.
  assert.equal(
    privateSfu.subscribedClientIds.has(publisher.clientId),
    false,
    'RECOVERY-LADDER: subscribe guard not left latched at needs-rejoin — low-frequency continuation still owns retry',
  );
}

// Fires the ~30s low-frequency continuation `cycles` times and asserts each cycle issues another
// subscribe POST and emits a `throttled` marker — the concrete proof that rung-2 exhaustion is NOT a
// terminal stop (this is what replaces the old permanent-latch bug).
async function assertLowFrequencyContinuationNeverGivesUp(
  sfu: SfuClientService,
  timers: FakeTimer[],
  publisher: RemotePublisher,
  httpPost: { calls: number },
  cycles = 3,
): Promise<void> {
  const privateSfu = sfu as unknown as { disarmSubscribeStuckWatchdog: (publisherClientId: string) => void };
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const before = httpPost.calls;
    const activeTimers = timers.filter((timer) => timer.active);
    assert.ok(activeTimers.length > 0, `RECOVERY-LADDER: low-frequency timer still armed before cycle ${cycle + 1} (never-give-up)`);
    fireNextActiveTimer(timers);
    await flushSfuQueue(sfu);
    privateSfu.disarmSubscribeStuckWatchdog(publisher.clientId);
    assert.ok(httpPost.calls > before, `RECOVERY-LADDER: low-frequency cycle ${cycle + 1} issues another POST — never permanently stops`);
    assert.equal(sfu.lastRecoveryEvent()?.rung, 'throttled', `RECOVERY-LADDER: low-frequency cycle ${cycle + 1} emits throttled marker`);
  }
}

// BUG-REPRO-R1-406-subscribe-cap-escalates — forced /api/sfu/tracks 406 escalates rung1->rung2->needs-rejoin
// and keeps retrying at low frequency instead of permanently latching give-up (was cap-give-up pre-B2a).
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

    sfu.subscribeIfNeeded(publisher);
    const callsBeforeDrive = httpPost.calls;
    const events = await driveSubscribeRecoveryUntilNeedsRejoin(sfu, timers, publisher);
    assert.ok(httpPost.calls > callsBeforeDrive, 'BUG-REPRO-R1-406: subscribe POST attempts fire while the ladder escalates');

    assertEscalationOutcome(sfu, publisher, events);
    await assertLowFrequencyContinuationNeverGivesUp(sfu, timers, publisher, httpPost);
  });
}

// BUG-REPRO-R1-advertised-not-subscribed-stuck-escalates — subscribe POST fails at the transport layer;
// the same coordinator escalates rung1->rung2->needs-rejoin and keeps retrying (was stuck-give-up pre-B2a).
{
  await withFakeTimersAsync(async (timers) => {
    const httpPost = { calls: 0 };
    const http = {
      post: (url: string) => {
        if (url !== '/api/sfu/tracks') return of({ sessionDescription: { type: 'answer', sdp: 'answer-sdp' } });
        httpPost.calls += 1;
        return throwError(() => new Error('subscribe transport unavailable'));
      },
    } as unknown as Partial<HttpClient>;

    const sfu = createSfuClient(http);
    const pc = makeSingleTrackSubscribePc();
    installPublishedSfuState(sfu, pc);
    const publisher = makeBobPublisher();
    sfu.remotePublishers.set(new Map([[publisher.clientId, publisher]]));

    sfu.subscribeIfNeeded(publisher);
    const events = await driveSubscribeRecoveryUntilNeedsRejoin(sfu, timers, publisher);
    assert.ok(httpPost.calls >= 6, 'BUG-REPRO-R1-stuck: subscribe attempts reach needs-rejoin via the retry/renegotiate ladder');

    assertEscalationOutcome(sfu, publisher, events);
    await assertLowFrequencyContinuationNeverGivesUp(sfu, timers, publisher, httpPost);
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

    await driveSubscribeRecoveryUntilNeedsRejoin(sfu, timers, publisher);
    const finalEvidence = sfu.lastSubscribeFailureEvidence();
    assert.ok(finalEvidence, 'BUG-REPRO-R1-406-evidence: evidence remains available at needs-rejoin');
    assert.equal(finalEvidence?.httpStatus, 406, 'BUG-REPRO-R1-406-evidence: final evidence retains httpStatus 406');
    assert.equal(isLastGumErrorCandidate(make406Error()), false, 'BUG-REPRO-R1-406-evidence: subscribe 406 must never be classified as GUM');
  });
}

console.log('sfu-repro-harness: all assertions passed');