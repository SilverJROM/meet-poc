import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyMediaElementSinkWithDefaultFallback,
  decideVoiceRecovery,
  RemoteAudioService,
  type VoiceRecoverySample,
} from './remote-audio.service.js';
import { classifyRemoteAudioHealth } from './remote-audio-health.js';
import { deriveOutboundAudioFields } from './mic-energy.js';
import {
  applyPresenceUpdate,
  type RemotePublisher,
  planInitialPublishRetry,
  planSfuTransportRecovery,
  planSubscribeRetry,
  removeFromRoster,
  selectNewRemoteTracks,
} from './sfu-roster-utils.js';
import { reconcileSubscribedMids } from './sfu-mid-reconcile.js';
import { decideRemoteVoiceWatchdogAction } from '../pages/room/room-decisions.js';

type Listener = () => void;

type InboundAudioFrame = {
  bytesReceived: number | null;
  packetsReceived: number | null;
  packetsLost: number | null;
  jitterBufferEmittedCount: number | null;
  concealedSamples: number | null;
  audioLevel: number | null;
  totalAudioEnergy: number | null;
};

type ReplayFixture = {
  t2Deferred: string[];
  historical: Record<string, any>;
};

class FakeAudioElement {
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  srcObject: unknown = null;
  volume = 1;
  muted = false;
  paused = true;
  sinkId = '';
  removed = false;
  readonly calls: string[] = [];
  private readonly listeners = new Map<string, Listener[]>();

  setAttribute(): void {
    // Test fake: attributes are not part of this replay contract.
  }

  addEventListener(name: string, listener: Listener): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }

  removeEventListener(name: string, listener: Listener): void {
    this.listeners.set(name, (this.listeners.get(name) ?? []).filter((current) => current !== listener));
  }

  async setSinkId(deviceId: string): Promise<void> {
    this.calls.push(`setSinkId:${deviceId}`);
    this.sinkId = deviceId;
  }

  async play(): Promise<void> {
    this.calls.push('play');
    this.paused = false;
    this.dispatch('playing');
  }

  pause(): void {
    this.paused = true;
    this.dispatch('pause');
  }

  remove(): void {
    this.removed = true;
  }

  dispatch(name: string): void {
    for (const listener of this.listeners.get(name) ?? []) listener();
  }
}

class FakeTrack {
  readonly kind = 'audio';
  readyState: MediaStreamTrackState = 'live';
  private readonly listeners = new Map<string, Listener[]>();

  constructor(readonly id: string) {}

  addEventListener(name: string, listener: Listener): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }

  removeEventListener(name: string, listener: Listener): void {
    this.listeners.set(name, (this.listeners.get(name) ?? []).filter((current) => current !== listener));
  }
}

class FakeMediaStream {
  constructor(private readonly track: FakeTrack) {}

  getAudioTracks(): FakeTrack[] {
    return [this.track];
  }
}

function installFakeDom(options: { hangingSink?: boolean } = {}): { elements: FakeAudioElement[] } {
  const elements: FakeAudioElement[] = [];
  const document = {
    body: {
      append: () => undefined,
    },
    createElement: (tag: string) => {
      assert.equal(tag, 'audio');
      const el = new FakeAudioElement();
      if (options.hangingSink) {
        el.setSinkId = async (deviceId: string): Promise<void> => {
          el.calls.push(`setSinkId:${deviceId}`);
          await new Promise(() => undefined);
        };
      }
      elements.push(el);
      return el;
    },
  };
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: { localStorage: new MapStorage() }, configurable: true });
  return { elements };
}

class MapStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function stream(trackId: string): MediaStream {
  return new FakeMediaStream(new FakeTrack(trackId)) as unknown as MediaStream;
}

function voiceSamples(frames: InboundAudioFrame[]): VoiceRecoverySample[] {
  return frames.map((frame) => ({
    bytes: frame.bytesReceived ?? -1,
    emitted: frame.jitterBufferEmittedCount ?? -1,
    audioLevel: frame.audioLevel,
    totalAudioEnergy: frame.totalAudioEnergy,
  }));
}

function loadFixture(): ReplayFixture {
  const fixtureUrl = new URL('./fixtures/remote-audio-telemetry-replay.json', import.meta.url);
  return JSON.parse(fs.readFileSync(fixtureUrl, 'utf8')) as ReplayFixture;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const issuesPath = resolve(
  repoRoot,
  'plan/WK_0526/meet-crossplatform-devices/regression-coverage-2026-06-08/issues/ISSUES.md',
);

function recordIssue(marker: string, title: string, detail: string): void {
  const existing = fs.existsSync(issuesPath) ? fs.readFileSync(issuesPath, 'utf8') : '# Phase C Issues\n';
  if (existing.includes(marker)) return;
  const entry = [
    '',
    `## ${marker} ${title}`,
    '',
    detail,
    '',
  ].join('\n');
  fs.writeFileSync(issuesPath, `${existing.trimEnd()}${entry}`);
}

const failures: string[] = [];

async function scenario(name: string, run: () => void | Promise<void>, issue?: { marker: string; title: string; detail: string }): Promise<void> {
  try {
    await run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push(`${name}: ${message}`);
    if (issue) recordIssue(issue.marker, issue.title, `${issue.detail}\n\nObserved failure: ${message}`);
  }
}

const fixture = loadFixture();

await scenario('H1 inbound-audio-recv-no-audioLevel/energy triggers actionable recovery', () => {
  const samples = voiceSamples(fixture.historical['H1'].frames);
  assert.equal(samples.length, 4);
  assert.ok(samples[3].bytes > samples[0].bytes, 'real fixture has climbing inbound bytes');
  assert.equal(samples[3].emitted, samples[0].emitted, 'real fixture has flat emitted count');
  assert.ok(samples.every((sample) => sample.audioLevel === null && sample.totalAudioEnergy === null));
  assert.equal(
    decideVoiceRecovery({ samples, attemptsThisWindow: 0, mutedAll: false }),
    'resume',
    'catalog expects bytes-climbing/no-energy inbound stall to enter recoverVoicePlayout path',
  );
}, {
  marker: 'PHASE-C-H1-NULL-ENERGY-NO-RECOVERY',
  title: 'H1 bytes-climbing null audio-energy stall is not actionable',
  detail: 'The H1 replay fixture from session 11ee886f has climbing inbound bytes with flat emitted count and null audioLevel/totalAudioEnergy. Current decideVoiceRecovery returns no action because sampleWindowHasVoiceEnergy is false.',
});

await scenario('H2 high concealment while emitting is diagnostic-only, not broken-audio verdict', () => {
  const frames = fixture.historical['H2'].frames as InboundAudioFrame[];
  const high = frames.find((frame) => (frame.concealedSamples ?? 0) > 200_000);
  assert.ok(high, 'real fixture includes high concealedSamples');
  assert.ok((high.jitterBufferEmittedCount ?? 0) > 0, 'real fixture is still emitting audio samples');
  assert.notEqual(
    classifyRemoteAudioHealth({
      kind: 'audio',
      bytesReceived: high.bytesReceived,
      packetsReceived: high.packetsReceived,
      jitterBufferEmittedCount: high.jitterBufferEmittedCount,
      concealedSamples: high.concealedSamples,
    }),
    'silent',
    'catalog expects high concealment to be captured without falsely classifying emitting audio as broken',
  );
}, {
  marker: 'PHASE-C-H2-HIGH-CONCEALMENT-FALSE-SILENT',
  title: 'H2 high concealment can classify emitting audio as silent',
  detail: 'The H2 replay fixture from session 2579eb8f contains high concealedSamples while jitterBufferEmittedCount is positive. Current classifyRemoteAudioHealth can return silent solely from the concealment ratio.',
});

await scenario('H3 packet loss is captured without triggering ICE recovery', () => {
  const frames = fixture.historical['H3'].frames as InboundAudioFrame[];
  assert.ok(frames.some((frame) => (frame.packetsLost ?? 0) > 0), 'real fixture captures packetsLost > 0');
  const recovery = planSfuTransportRecovery({
    connectionState: 'connected',
    iceConnectionState: 'connected',
    disconnectedElapsedMs: null,
    disconnectedGraceMs: 8000,
    currentAttempts: 2,
    cap: 3,
  });
  assert.equal(recovery.action, 'reset', 'packet loss alone must not be treated as ICE failure');
});

await scenario('H4 relay path persists as relay diagnostics without failure', () => {
  const frame = fixture.historical['H4'].frame;
  assert.equal(frame.localCandidateType, 'relay');
  assert.equal(frame.connectionState, 'connected');
  assert.equal(frame.iceConnectionState, 'connected');
  const recovery = planSfuTransportRecovery({
    connectionState: frame.connectionState,
    iceConnectionState: frame.iceConnectionState,
    disconnectedElapsedMs: null,
    disconnectedGraceMs: 8000,
    currentAttempts: 1,
    cap: 3,
  });
  assert.equal(recovery.action, 'reset');
});

await scenario('H5 subscribe stuck without first frame plans bounded retry', () => {
  const latency = fixture.historical['H5'].latency;
  assert.equal(latency.firstFrameAtMs, null);
  assert.ok(fixture.historical['H5'].ageMs > 10_000);
  const retry = planSubscribeRetry({ currentAttempts: 0, cap: 7, hasFirstFrame: false, baseBackoffMs: 250, maxBackoffMs: 4000 });
  assert.equal(retry.shouldRetry, true);
  assert.equal(retry.reason, 'retry');
});

await scenario('H6 websocket reconnect/disconnect is diagnostic, not permanent drop', () => {
  const wsHealth = fixture.historical['H6'].wsHealth;
  assert.ok(wsHealth.disconnectCount > 0 || wsHealth.reconnectAttempts > 0);
  assert.equal(wsHealth.status, 'connected');
});

await scenario('H7 one-inbound-audio-at-a-time keeps both publishers in playout registry', async () => {
  installFakeDom();
  const service = new RemoteAudioService();
  service.setInCallActive(true);
  await service.addPublisher('0066d017c1c3b02c', stream('track-a'), undefined, 'sfu-audio-a');
  await service.addPublisher('4565b67c68a2cfe3', stream('track-b'), undefined, 'sfu-audio-b');
  const publishers = service.playoutDiagnostics().perPublisher.map((row) => row.publisherClientId).sort();
  assert.deepEqual(publishers, [...fixture.historical['H7'].publishers].sort());
  assert.equal(service.remoteAudioBlocked(), false);
});

await scenario('H8 high RTT hint does not falsely fail connected transport', () => {
  const frame = fixture.historical['H8'].frame;
  assert.ok(frame.lastHeartbeatRttMs >= 150);
  const recovery = planSfuTransportRecovery({
    connectionState: frame.connectionState,
    iceConnectionState: frame.iceConnectionState,
    disconnectedElapsedMs: null,
    disconnectedGraceMs: 8000,
    currentAttempts: 1,
    cap: 3,
  });
  assert.equal(recovery.action, 'reset');
});

await scenario('H9 outbound audio 0 bytes is local mic silence, not remote watchdog', () => {
  const frames = fixture.historical['H9'].frames;
  assert.ok(frames.length >= 4);
  assert.ok(frames.every((frame: any) => frame.bytesSent === 0));
  const fields = deriveOutboundAudioFields({
    audioSource: { audioLevel: frames[0].outboundAudioLevel, totalAudioEnergy: frames[0].outboundAudioEnergy },
    hasLiveAudioTrack: true,
    micEnabled: true,
  });
  assert.equal(fields.micSilent, true);
  const action = decideRemoteVoiceWatchdogAction({
    previousSamples: [],
    attemptsThisWindow: 0,
    sample: null,
    mutedAll: false,
  });
  assert.equal(action.kind, 'clear', 'local outbound silence does not create a remote recovery action');
});

await scenario('H10 failed/failed transport plans relay-refresh recovery', () => {
  const frame = fixture.historical['H10'].frame;
  assert.equal(frame.connectionState, 'failed');
  assert.equal(frame.iceConnectionState, 'failed');
  const recovery = planSfuTransportRecovery({
    connectionState: frame.connectionState,
    iceConnectionState: frame.iceConnectionState,
    disconnectedElapsedMs: null,
    disconnectedGraceMs: 8000,
    currentAttempts: 0,
    cap: 3,
  });
  assert.equal(recovery.action, 'recover');
  assert.equal(recovery.backoffMs, 0);
});

await scenario('H11 publish error is surfaced, not silent', () => {
  const frame = fixture.historical['H11'].frame;
  assert.equal(frame.publishStatus, 'error');
  assert.match(frame.publishError, /timed out/);
  const retry = planInitialPublishRetry({ published: false, failedAttempt: 1, cap: 3, retryableFailure: true });
  assert.equal(retry.shouldRetry, true, 'retryable publish errors enter bounded retry');
});

await scenario('H12 inbound audioLevel=0 sustained is actionable like null-energy stall', () => {
  const samples = voiceSamples(fixture.historical['H12'].frames);
  assert.equal(samples.length, 4);
  assert.ok(samples.every((sample) => sample.audioLevel === 0));
  assert.equal(
    decideVoiceRecovery({ samples, attemptsThisWindow: 0, mutedAll: false }),
    'resume',
    'catalog expects sustained audioLevel=0 receiving window to use the stalled-verdict path',
  );
}, {
  marker: 'PHASE-C-H12-ZERO-LEVEL-NO-RECOVERY',
  title: 'H12 sustained inbound audioLevel=0 is not actionable',
  detail: 'The H12 replay fixture from session 11ee886f has sustained inbound audioLevel=0. Current decideVoiceRecovery returns no action because emitted samples climb and totalAudioEnergy is null.',
});

await scenario('R2 selected sink rejection taxonomy distinguishes fallback and failure', async () => {
  const fallbackElement = {
    calls: [] as string[],
    async setSinkId(sinkId: string): Promise<void> {
      this.calls.push(sinkId);
      if (sinkId === 'not-found') throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
    },
  } as HTMLMediaElement & { calls: string[]; setSinkId: (sinkId: string) => Promise<void> };
  assert.equal(await applyMediaElementSinkWithDefaultFallback(fallbackElement, 'not-found'), 'default-fallback');
  assert.deepEqual(fallbackElement.calls, ['not-found', '']);

  const failedElement = {
    async setSinkId(): Promise<void> {
      throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    },
  } as unknown as HTMLMediaElement & { setSinkId: (sinkId: string) => Promise<void> };
  assert.equal(await applyMediaElementSinkWithDefaultFallback(failedElement, 'denied-speaker'), 'failed');
});

await scenario('R3 browsers without setSinkId report unsupported without crashing', async () => {
  assert.equal(await applyMediaElementSinkWithDefaultFallback({} as HTMLMediaElement, 'ios-speaker'), 'unsupported');
  assert.equal(await applyMediaElementSinkWithDefaultFallback({} as HTMLMediaElement, ''), 'selected');
});

await scenario('R7 devicechange/headset unplug sink timeout is bounded and diagnostic', async () => {
  installFakeDom({ hangingSink: true });
  const service = new RemoteAudioService();
  service.setInCallActive(true);
  await service.applyOutputDevice('stale-headset');
  const started = Date.now();
  await service.addPublisher('client-a', stream('track-a'));
  const elapsed = Date.now() - started;
  const row = service.playoutDiagnostics().perPublisher[0];
  assert.ok(elapsed < 2_500, `sink timeout should be bounded near 2s, saw ${elapsed}ms`);
  assert.equal(row.sinkApplyTimedOut, true);
  assert.equal(row.paused, false, 'audio element still plays through current/default output after timeout');
});

await scenario('R8 Opus DTX silence does not trigger false recovery/banner', () => {
  const bytesFlat: VoiceRecoverySample[] = [
    { bytes: 5_000, emitted: 10, audioLevel: 0, totalAudioEnergy: 0 },
    { bytes: 5_000, emitted: 10, audioLevel: 0, totalAudioEnergy: 0 },
    { bytes: 5_000, emitted: 10, audioLevel: 0, totalAudioEnergy: 0 },
    { bytes: 5_000, emitted: 10, audioLevel: 0, totalAudioEnergy: 0 },
  ];
  assert.equal(decideVoiceRecovery({ samples: bytesFlat, attemptsThisWindow: 0, mutedAll: false }), 'none');
  const emittedClimbing: VoiceRecoverySample[] = [
    { bytes: 1_000, emitted: 10, audioLevel: 0, totalAudioEnergy: 0 },
    { bytes: 2_000, emitted: 11, audioLevel: 0, totalAudioEnergy: 0 },
    { bytes: 3_000, emitted: 12, audioLevel: 0, totalAudioEnergy: 0 },
    { bytes: 4_000, emitted: 13, audioLevel: 0, totalAudioEnergy: 0 },
  ];
  const action = decideRemoteVoiceWatchdogAction({
    previousSamples: emittedClimbing.slice(0, 3),
    attemptsThisWindow: 0,
    sample: emittedClimbing[3],
    mutedAll: false,
  });
  assert.equal(action.kind, 'note-emission-advanced');
});

await scenario('R9 ICE restart gap recovers then resets after reconnect', () => {
  const failed = planSfuTransportRecovery({
    connectionState: 'failed',
    iceConnectionState: 'failed',
    disconnectedElapsedMs: null,
    disconnectedGraceMs: 8000,
    currentAttempts: 0,
    cap: 3,
  });
  const checking = planSfuTransportRecovery({
    connectionState: 'connecting',
    iceConnectionState: 'checking',
    disconnectedElapsedMs: null,
    disconnectedGraceMs: 8000,
    currentAttempts: failed.nextAttempts,
    cap: 3,
  });
  const connected = planSfuTransportRecovery({
    connectionState: 'connected',
    iceConnectionState: 'connected',
    disconnectedElapsedMs: null,
    disconnectedGraceMs: 8000,
    currentAttempts: failed.nextAttempts,
    cap: 3,
  });
  assert.equal(failed.action, 'recover');
  assert.equal(checking.action, 'ignore');
  assert.equal(connected.action, 'reset');
  assert.equal(planSubscribeRetry({ currentAttempts: 0, cap: 7, hasFirstFrame: false }).shouldRetry, true);
});

await scenario('R10 renegotiation glare/duplicate roster updates do not double-subscribe', () => {
  const current = new Map<string, RemotePublisher>();
  const first = applyPresenceUpdate(current, {
    clientId: 'alice',
    participantId: 'p-alice',
    cfSessionId: 'cf-1',
    revision: 2,
    tracks: [{ trackName: 'alice-audio', kind: 'audio' }],
  });
  const stale = applyPresenceUpdate(first, {
    clientId: 'alice',
    participantId: 'p-alice',
    cfSessionId: 'cf-1',
    revision: 1,
    tracks: [{ trackName: 'stale-audio', kind: 'audio' }],
  });
  assert.equal(stale, first, 'older simultaneous presence update is ignored');
  assert.deepEqual(selectNewRemoteTracks([{ trackName: 'alice-audio', kind: 'audio' }], first.get('alice')!.tracks, new Set()), []);
});

await scenario('R11 stored volume above native cap migrates to 1.0', () => {
  const storage = new MapStorage();
  storage.setItem('meet-poc:volume:value', '1.3');
  Object.defineProperty(globalThis, 'window', { value: { localStorage: storage }, configurable: true });
  const service = new RemoteAudioService();
  assert.equal(service.volume(), 1);
  assert.equal(storage.getItem('meet-poc:volume:value'), '1');
});

await scenario('R12 stale Cloudflare track/mid mapping is replaced by current publisher', () => {
  const publishers = applyPresenceUpdate(new Map<string, RemotePublisher>(), {
    clientId: 'alice',
    participantId: 'p-alice',
    cfSessionId: 'old-cf',
    revision: 1,
    tracks: [{ trackName: 'alice-old-audio', kind: 'audio' }],
  });
  const removed = removeFromRoster(publishers, 'alice');
  assert.equal(removed.has('alice'), false);

  const reconciled = reconcileSubscribedMids(
    [{ trackName: 'bob-audio', mid: '' }],
    ['2'],
    [{ mid: '2', receiver: { track: { kind: 'audio' } } } as RTCRtpTransceiver],
    new Map([['bob-audio', 'audio']]),
    'bob',
  );
  assert.deepEqual(reconciled, [{ realMid: '2', publisherClientId: 'bob', trackName: 'bob-audio', kind: 'audio' }]);
});

await scenario('T2-only researched scenarios are marked deferred by fixture metadata', () => {
  assert.deepEqual(fixture.t2Deferred, [
    'R1 setSinkId-before-play first-frame acoustic proof',
    'R4 autoplay no-gesture real browser',
    'R5 Android/page backgrounding',
    'R6 MediaRecorder background frame-gap',
    'R13 simulcast/RID fallback',
  ]);
});

if (failures.length > 0) {
  throw new Error(`remote-audio-telemetry-replay failed ${failures.length} scenario(s):\n${failures.join('\n')}`);
}

console.log('remote-audio-telemetry-replay: all assertions passed');
