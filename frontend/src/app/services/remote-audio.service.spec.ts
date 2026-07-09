import assert from 'node:assert/strict';
import {
  AUDIO_OUTPUT_DEVICE_STORAGE_KEY,
  applyMediaElementSinkWithDefaultFallback,
  clearStoredAudioOutputDeviceId,
  computeRemoteAutoGains,
  currentAudioTrack,
  LatestSinkIdApplier,
  RemoteAudioService,
  voiceRecoveryWindowExhaustedWhileStalled,
} from './remote-audio.service.js';

type Listener = () => void;

class FakeAudioElement {
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  srcObject: unknown = null;
  volume = 1;
  muted = false;
  paused = true;
  sinkId = '';
  isConnected = false;
  removed = false;
  pauseCalled = false;
  playReject: unknown = null;
  calls: string[] = [];
  rejectSinkIds = new Set<string>();
  readonly attributes = new Set<string>();
  private readonly listeners = new Map<string, Listener[]>();

  setAttribute(name: string, value: string): void {
    this.attributes.add(`${name}=${value}`);
  }

  addEventListener(name: string, listener: Listener): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }

  removeEventListener(name: string, listener: Listener): void {
    this.listeners.set(name, (this.listeners.get(name) ?? []).filter((current) => current !== listener));
  }

  async setSinkId(deviceId: string): Promise<void> {
    this.calls.push(`setSinkId:${deviceId}`);
    if (this.rejectSinkIds.has(deviceId)) throw new Error(`bad sink ${deviceId}`);
    this.sinkId = deviceId;
  }

  async play(): Promise<void> {
    this.calls.push('play');
    if (this.playReject) throw this.playReject;
    this.paused = false;
    this.dispatch('playing');
  }

  pause(): void {
    this.pauseCalled = true;
    this.paused = true;
    this.dispatch('pause');
  }

  remove(): void {
    this.removed = true;
    this.isConnected = false;
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
  constructor(private tracks: FakeTrack[]) {}

  getAudioTracks(): FakeTrack[] {
    return this.tracks;
  }

  replaceAudioTrack(track: FakeTrack): void {
    this.tracks = [track];
  }
}

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

type FakeSinkElement = HTMLMediaElement & {
  calls: string[];
  setSinkId: (sinkId: string) => Promise<void>;
};

function fakeSinkElement(rejectIds: Set<string>): FakeSinkElement {
  const element = {
    calls: [] as string[],
    async setSinkId(sinkId: string): Promise<void> {
      this.calls.push(sinkId);
      if (rejectIds.has(sinkId)) throw new Error(`bad sink ${sinkId}`);
    },
  };
  return element as FakeSinkElement;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for sink test predicate');
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function installFakeDom(options: string | { storedVolume?: string; withoutSinkId?: boolean; playReject?: unknown } = {}): { elements: FakeAudioElement[]; localStorage: Map<string, string> } {
  const config = typeof options === 'string' ? { storedVolume: options } : options;
  const elements: FakeAudioElement[] = [];
  const store = new Map<string, string>();
  if (config.storedVolume !== undefined) store.set('meet-poc:volume:value', config.storedVolume);
  const body = {
    append: (el: FakeAudioElement) => {
      el.isConnected = true;
    },
  };
  const document = {
    body,
    createElement: (tag: string) => {
      assert.strictEqual(tag, 'audio');
      const el = new FakeAudioElement();
      if (config.withoutSinkId) (el as unknown as { setSinkId?: undefined }).setSinkId = undefined;
      if (config.playReject) el.playReject = config.playReject;
      elements.push(el);
      return el;
    },
  };
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: { localStorage }, configurable: true });
  return { elements, localStorage: store };
}

function endedStream(trackId: string): MediaStream {
  const track = new FakeTrack(trackId);
  track.readyState = 'ended';
  return new FakeMediaStream([track]) as unknown as MediaStream;
}

function stream(trackId: string): MediaStream {
  return new FakeMediaStream([new FakeTrack(trackId)]) as unknown as MediaStream;
}

function peer(id: string, mediaStream: MediaStream): Parameters<RemoteAudioService['syncPeers']>[0][number] {
  return {
    id,
    participantId: id,
    name: id,
    stream: mediaStream,
    pc: null,
    connectionState: 'connected',
    isLocal: false,
    isHost: false,
    micEnabled: true,
    camEnabled: false,
    screenOn: false,
    reconnecting: false,
    isMobile: false,
    quality: 'good',
    audioOnlyReason: null,
  };
}

// B13-U1/B20: bad selected sink retries default and reports the fallback distinctly.
{
  const memory = new MemoryStorage();
  memory.setItem(AUDIO_OUTPUT_DEVICE_STORAGE_KEY, 'stale-speaker');
  Object.defineProperty(globalThis, 'window', { value: { localStorage: memory }, configurable: true });
  const element = fakeSinkElement(new Set(['stale-speaker']));

  const applied = await applyMediaElementSinkWithDefaultFallback(element, 'stale-speaker', {
    onSelectedSinkFailure: clearStoredAudioOutputDeviceId,
    label: 'unit-bad-sink',
  });

  assert.strictEqual(applied, 'default-fallback', 'bad selected sink reports default fallback when default succeeds');
  assert.deepStrictEqual(element.calls, ['stale-speaker', ''], 'bad selected sink retries default output for the same element');
  assert.strictEqual(memory.getItem(AUDIO_OUTPUT_DEVICE_STORAGE_KEY), null, 'bad selected sink clears stored output id');
}

// B13-U2: valid selected sink applies once and remains persisted.
{
  const memory = new MemoryStorage();
  memory.setItem(AUDIO_OUTPUT_DEVICE_STORAGE_KEY, 'valid-speaker');
  Object.defineProperty(globalThis, 'window', { value: { localStorage: memory }, configurable: true });
  const element = fakeSinkElement(new Set());

  const applied = await applyMediaElementSinkWithDefaultFallback(element, 'valid-speaker', {
    onSelectedSinkFailure: clearStoredAudioOutputDeviceId,
    label: 'unit-valid-sink',
  });

  assert.strictEqual(applied, 'selected', 'valid selected sink reports selected output');
  assert.deepStrictEqual(element.calls, ['valid-speaker'], 'valid selected sink does not fall back to default');
  assert.strictEqual(memory.getItem(AUDIO_OUTPUT_DEVICE_STORAGE_KEY), 'valid-speaker', 'valid selected sink remains stored');
}

// CR-FIX-4 — browsers without setSinkId report unsupported, not selected success.
{
  const element = {} as HTMLMediaElement;

  const applied = await applyMediaElementSinkWithDefaultFallback(element, 'speaker-without-set-sink-id', {
    label: 'unit-unsupported-sink',
  });

  assert.strictEqual(applied, 'unsupported', 'non-default sink on unsupported browser reports unsupported');
  assert.strictEqual(await applyMediaElementSinkWithDefaultFallback(element, '', { label: 'unit-default-no-sink' }), 'selected');
}

// ERR9: concurrent requests for the same element do not overlap and coalesce to the latest sink.
{
  const firstCall = deferred();
  const calls: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let currentSinkId = '';
  const element = {
    async setSinkId(sinkId: string): Promise<void> {
      calls.push(sinkId);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        if (calls.length === 1) await firstCall.promise;
        else await new Promise((resolve) => setTimeout(resolve, 0));
        currentSinkId = sinkId;
      } finally {
        inFlight -= 1;
      }
    },
  } as HTMLMediaElement & { setSinkId: (sinkId: string) => Promise<void> };
  const applier = new LatestSinkIdApplier();

  const first = applier.apply(element, 'speaker-a', { label: 'unit-err9' });
  await waitFor(() => calls.length === 1);
  const second = applier.apply(element, 'speaker-b', { label: 'unit-err9' });
  const third = applier.apply(element, 'speaker-c', { label: 'unit-err9' });
  firstCall.resolve();
  await Promise.all([first, second, third]);

  assert.deepStrictEqual(calls, ['speaker-a', 'speaker-c'], 'latest sink coalescer skips stale middle requests');
  assert.strictEqual(maxInFlight, 1, 'latest sink coalescer serializes setSinkId per element');
  assert.strictEqual(currentSinkId, 'speaker-c', 'latest sink coalescer converges to final chosen output');
}

// RA-REG-1 — addPublisher applies setSinkId before service-owned play(), with no autoplay attr.
{
  const { elements } = installFakeDom();
  const service = new RemoteAudioService();
  service.setInCallActive(true);
  await service.applyOutputDevice('speaker-1');
  await service.addPublisher('client-a', stream('track-a'));

  assert.deepStrictEqual(elements[0].calls, ['setSinkId:speaker-1', 'play'], 'setSinkId must run before play');
  assert.ok(!elements[0].attributes.has('autoplay='), 'registry element must not set autoplay attr');
}

// CR-FIX-5 R1 — inbound energy plus selected-sink element playout resolves to audible.
{
  installFakeDom();
  const service = new RemoteAudioService();
  service.setInCallActive(true);
  await service.applyOutputDevice('speaker-selected');
  await service.addPublisher('client-a', stream('track-a'), undefined, 'sfu-audio-a');

  const diag = service.playoutDiagnostics();
  const row = diag.perPublisher[0];
  assert.strictEqual(row.paused, false, 'playing element is not paused');
  assert.strictEqual(row.sinkId, 'speaker-selected', 'publisher element plays on selected sink');
  assert.strictEqual(row.blockedReason, null, 'audible selected-sink publisher has no blocked reason');
  assert.strictEqual(row.sinkApplyResult, 'selected', 'selected sink application is recorded per publisher');
  assert.strictEqual(row.sinkApplyTimedOut, false, 'selected sink application did not time out');
  assert.strictEqual(service.remoteAudioBlocked(), false, 'audible publisher does not raise unblock banner');
}

// CR-FIX-5 R2 — two publishers remain simultaneously audible; removing A leaves B audible.
{
  const { elements } = installFakeDom();
  const service = new RemoteAudioService();
  service.setInCallActive(true);
  service.setVolume(0.7);
  await service.applyOutputDevice('speaker-selected');
  await service.addPublisher('client-a', stream('track-a'), undefined, 'sfu-audio-a');
  await service.addPublisher('client-b', stream('track-b'), undefined, 'sfu-audio-b');

  let diag = service.playoutDiagnostics();
  assert.deepStrictEqual(diag.perPublisher.map((row) => row.publisherClientId).sort(), ['client-a', 'client-b'], 'both publishers have registry diagnostics');
  for (const row of diag.perPublisher) {
    assert.strictEqual(row.paused, false, `${row.publisherClientId} is playing`);
    assert.strictEqual(row.blockedReason, null, `${row.publisherClientId} is not blocked`);
    assert.strictEqual(row.sinkId, 'speaker-selected', `${row.publisherClientId} uses selected sink`);
    assert.strictEqual(row.volume, 0.7, `${row.publisherClientId} uses current service volume`);
  }
  assert.strictEqual(elements.filter((el) => el.isConnected && !el.removed).length, 2, 'both audio elements are connected simultaneously');

  service.removePublisher('client-a');
  diag = service.playoutDiagnostics();
  assert.deepStrictEqual(diag.perPublisher.map((row) => row.publisherClientId), ['client-b'], 'removing A leaves B registered');
  assert.strictEqual(diag.perPublisher[0].paused, false, 'B remains playing after A removal');
  assert.strictEqual(diag.perPublisher[0].blockedReason, null, 'B remains unblocked after A removal');
  assert.strictEqual(diag.perPublisher[0].sinkId, 'speaker-selected', 'B keeps selected sink after A removal');
}

// RA-REG-2 — per-element volume/mute mirrors service state, including mute-all volume=0.
{
  const { elements } = installFakeDom();
  const service = new RemoteAudioService();
  service.setInCallActive(true);
  service.setVolume(0.6);
  await service.addPublisher('client-a', stream('track-a'));
  assert.strictEqual(elements[0].volume, 0.6);
  assert.strictEqual(elements[0].muted, false);

  service.setMutedAll(true);
  assert.strictEqual(elements[0].volume, 0, 'mute-all forces element volume to 0');
  assert.strictEqual(elements[0].muted, true);

  service.setMutedAll(false);
  service.setVolume(1.4);
  assert.strictEqual(service.volume(), 1);
  assert.strictEqual(elements[0].volume, 1, 'native playout clamps to 100%');
  assert.strictEqual(elements[0].muted, false);
}

// RA-REG-3 — reset clears the registry by pausing, nulling srcObject, and removing every element.
{
  const { elements } = installFakeDom();
  const service = new RemoteAudioService();
  service.setInCallActive(true);
  await service.unlockAndPlayRemoteSinks('speaker-1');
  await service.addPublisher('client-a', stream('track-a'));
  await service.addPublisher('client-b', stream('track-b'));
  assert.strictEqual(service.debugSnapshot().unlocked, true);

  service.reset();
  assert.strictEqual(service.debugSnapshot().unlocked, false, 'reset clears sticky unlock between calls');
  assert.strictEqual(service.playoutDiagnostics().selectedAudioOutputId, null, 'reset clears per-call selected sink tracking');
  assert.strictEqual(service.playoutDiagnostics().effectiveSinkId, null, 'reset clears per-call effective sink tracking');
  assert.strictEqual(service.playoutDiagnostics().usedFallback, false, 'reset clears per-call fallback tracking');
  assert.strictEqual(elements.length, 2);
  for (const el of elements) {
    assert.strictEqual(el.pauseCalled, true);
    assert.strictEqual(el.srcObject, null);
    assert.strictEqual(el.removed, true);
    assert.strictEqual(el.isConnected, false);
  }
}

// RA-REG-3b — reset clears sticky unlock even when no publishers were present.
{
  installFakeDom();
  const service = new RemoteAudioService();
  service.setInCallActive(true);
  await service.unlockAndPlayRemoteSinks('speaker-1');
  service.reset();
  assert.strictEqual(service.debugSnapshot().unlocked, false);
}

// RA-REG-4 — explicit sticky unlock causes a late publisher to play immediately with no extra gesture.
{
  const { elements } = installFakeDom();
  const service = new RemoteAudioService();
  service.setInCallActive(true);
  await service.unlockAndPlayRemoteSinks('speaker-1');
  await service.addPublisher('late-client', stream('late-track'));

  assert.deepStrictEqual(elements[0].calls, ['setSinkId:speaker-1', 'play']);
  assert.strictEqual(service.debugSnapshot().unlocked, true);
}

// CR-FIX-3 — selected speaker failure that falls back to default is not reported as selected success.
{
  const { elements } = installFakeDom();
  const service = new RemoteAudioService();
  service.setInCallActive(true);
  await service.addPublisher('client-a', stream('track-a'));
  elements[0].rejectSinkIds.add('stale-speaker');

  const result = await service.applyOutputDevice('stale-speaker');

  assert.strictEqual(result, 'default-fallback', 'selected sink rejection reports default fallback');
  assert.deepStrictEqual(elements[0].calls.slice(-2), ['setSinkId:stale-speaker', 'setSinkId:'], 'remote audio retries default sink');
  assert.strictEqual(service.playoutDiagnostics().selectedAudioOutputId, 'stale-speaker', 'diagnostics keep the user-selected sink');
  assert.strictEqual(service.playoutDiagnostics().effectiveSinkId, '', 'diagnostics record default as the effective sink');
  assert.strictEqual(service.playoutDiagnostics().usedFallback, true, 'diagnostics mark fallback use');
  assert.strictEqual(service.remoteAudioBlocked(), false, 'playing default fallback does not raise the unblock banner');
  assert.strictEqual(service.playoutDiagnostics().perPublisher[0].blockedReason, null, 'playing default fallback is not a blocked publisher');

  elements[0].rejectSinkIds.delete('stale-speaker');
  const recovered = await service.applyOutputDevice('stale-speaker');

  assert.strictEqual(recovered, 'selected', 'selected sink success clears fallback status');
  assert.strictEqual(service.playoutDiagnostics().effectiveSinkId, 'stale-speaker');
  assert.strictEqual(service.playoutDiagnostics().usedFallback, false);
  assert.strictEqual(service.playoutDiagnostics().perPublisher[0].sinkApplyResult, 'selected', 'successful re-apply replaces the stale fallback result');
  assert.strictEqual(service.playoutDiagnostics().perPublisher[0].sinkApplyTimedOut, false, 'successful re-apply clears stale timeout state');
  assert.strictEqual(service.playoutDiagnostics().perPublisher[0].blockedReason, null, 'successful re-apply leaves no blocked reason');
  assert.strictEqual(service.remoteAudioBlocked(), false, 'successful re-apply leaves the aggregate unblocked');
}

// CR-FIX-6 — selected and default sink failure is the only sink result that blocks; later success self-clears.
{
  const { elements } = installFakeDom();
  const service = new RemoteAudioService();
  service.setInCallActive(true);
  await service.addPublisher('client-a', stream('track-a'));
  elements[0].rejectSinkIds.add('broken-speaker');
  elements[0].rejectSinkIds.add('');

  const failed = await service.applyOutputDevice('broken-speaker');

  assert.strictEqual(failed, 'failed', 'selected plus default sink rejection reports failed');
  assert.strictEqual(service.remoteAudioBlocked(), true, 'failed sink apply raises the unblock banner');
  assert.strictEqual(service.playoutDiagnostics().perPublisher[0].blockedReason, 'sink-failed', 'failed sink apply reports sink-failed');
  assert.strictEqual(service.playoutDiagnostics().perPublisher[0].sinkApplyResult, 'failed', 'failed sink result is recorded');

  elements[0].rejectSinkIds.clear();
  const recovered = await service.applyOutputDevice('broken-speaker');

  assert.strictEqual(recovered, 'selected', 'later selected sink success is reported');
  assert.strictEqual(service.playoutDiagnostics().perPublisher[0].sinkApplyResult, 'selected', 'later success replaces stale failed sink result');
  assert.strictEqual(service.playoutDiagnostics().perPublisher[0].sinkApplyTimedOut, false, 'later success clears stale timed-out state');
  assert.strictEqual(service.playoutDiagnostics().perPublisher[0].blockedReason, null, 'later success clears stale sink-failed reason');
  assert.strictEqual(service.remoteAudioBlocked(), false, 'later success clears stale aggregate blocked state');
}

// CR-FIX-4 — unsupported setSinkId keeps diagnostics honest without marking the selected speaker unavailable.
{
  const { elements } = installFakeDom({ withoutSinkId: true });
  const service = new RemoteAudioService();
  service.setInCallActive(true);
  await service.addPublisher('client-a', stream('track-a'));

  const result = await service.applyOutputDevice('speaker-without-set-sink-id');

  assert.strictEqual(result, 'unsupported');
  assert.deepStrictEqual(elements[0].calls, ['play'], 'unsupported browser still plays through default output');
  assert.strictEqual(service.playoutDiagnostics().selectedAudioOutputId, 'speaker-without-set-sink-id');
  assert.strictEqual(service.playoutDiagnostics().effectiveSinkId, '', 'diagnostics record default output as effective');
  assert.strictEqual(service.playoutDiagnostics().usedFallback, true, 'diagnostics mark fallback use for unsupported routing');
  assert.strictEqual(service.playoutDiagnostics().perPublisher[0].blockedReason, null, 'playing unsupported sink routing is not a blocked publisher');
  assert.strictEqual(service.remoteAudioBlocked(), false, 'playing unsupported sink routing does not raise the unblock banner');
}

// RA-REG-5 — blocked state is registry-backed: paused/blocked true, replay clears when playing.
{
  const { elements } = installFakeDom();
  const service = new RemoteAudioService();
  service.setInCallActive(true);
  await service.addPublisher('client-a', stream('track-a'));
  assert.strictEqual(service.remoteAudioBlocked(), false);

  elements[0].pause();
  assert.strictEqual(service.remoteAudioBlocked(), true, 'paused registry element surfaces unblock banner state');

  await service.recoverPlayback();
  assert.strictEqual(service.remoteAudioBlocked(), false, 'successful replay clears blocked state');
}

// CR-FIX-1 — watchdog voice-stall verdict latches the banner even when the element is unpaused, then clears on emitted advance.
{
  const { elements } = installFakeDom();
  const service = new RemoteAudioService();
  service.setInCallActive(true);
  await service.addPublisher('client-a', stream('track-a'));
  assert.strictEqual(elements[0].paused, false);
  assert.strictEqual(service.remoteAudioBlocked(), false);

  await service.recoverVoicePlayout('client-a', 'replay');

  assert.strictEqual(elements[0].paused, false, 'watchdog replay can leave the element unpaused');
  assert.strictEqual(service.remoteAudioBlocked(), true, 'voice-stall latch surfaces unblock banner despite unpaused element');

  service.noteVoiceEmissionAdvanced('client-a');
  assert.strictEqual(service.remoteAudioBlocked(), false, 'emitted-count advance clears voice-stall banner latch');

  await service.recoverVoicePlayout('client-a', 'replay');
  service.clearVoiceStalls(['client-a']);
  assert.strictEqual(service.remoteAudioBlocked(), false, 'explicit watchdog reset path clears voice-stall banner latch');
}

// CR-FIX-10 — bytes-flat watchdog clear path drops an already latched voice-stall banner.
{
  installFakeDom();
  const service = new RemoteAudioService();
  service.setInCallActive(true);
  await service.addPublisher('client-a', stream('track-a'));
  service.markVoiceStalled('client-a');
  assert.strictEqual(service.remoteAudioBlocked(), true, 'precondition: voice-stall banner is latched');

  service.clearVoiceStalls(['client-a']);

  assert.strictEqual(service.remoteAudioBlocked(), false, 'bytes-flat watchdog clear path clears the latched banner');
  assert.strictEqual(service.playoutDiagnostics().perPublisher[0].blockedReason, null, 'bytes-flat clear removes voice-stalled diagnostics');
}

// CR-FIX-10 — no-voice-energy watchdog clear path drops an already latched voice-stall banner.
{
  installFakeDom();
  const service = new RemoteAudioService();
  service.setInCallActive(true);
  await service.addPublisher('client-a', stream('track-a'));
  service.markVoiceStalled('client-a');
  assert.strictEqual(service.remoteAudioBlocked(), true, 'precondition: voice-stall banner is latched');

  service.clearVoiceStalls(['client-a']);

  assert.strictEqual(service.remoteAudioBlocked(), false, 'no-energy watchdog clear path clears the latched banner');
  assert.strictEqual(service.playoutDiagnostics().perPublisher[0].blockedReason, null, 'no-energy clear removes voice-stalled diagnostics');
}

// CR-FIX-10 — mute-all drops any latched voice-stall banner because intentional silence is not a playout fault.
{
  installFakeDom();
  const service = new RemoteAudioService();
  service.setInCallActive(true);
  await service.addPublisher('client-a', stream('track-a'));
  service.markVoiceStalled('client-a');
  assert.strictEqual(service.remoteAudioBlocked(), true, 'precondition: voice-stall banner is latched');

  service.setMutedAll(true);

  assert.strictEqual(service.remoteAudioBlocked(), false, 'mutedAll clears the latched voice-stall banner');
  assert.strictEqual(service.playoutDiagnostics().perPublisher[0].blockedReason, null, 'mutedAll removes voice-stalled diagnostics');
}

// CR-FIX-2 — playout diagnostics carries the SFU trackName separately from browser track.id.
{
  installFakeDom();
  const service = new RemoteAudioService();
  service.setInCallActive(true);
  const mediaStream = stream('browser-track-a');
  service.syncPeers(
    [peer('client-a', mediaStream)],
    new Map([['client-a', new Map([['browser-track-a', 'sfu-track-a']])]]),
  );
  await waitFor(() => service.playoutDiagnostics().perPublisher.length === 1);

  const row = service.playoutDiagnostics().perPublisher[0];
  assert.strictEqual(row.trackId, 'browser-track-a');
  assert.strictEqual(row.trackName, 'sfu-track-a');
}

// CR-FIX-4 — a stream whose only audio track is ended is treated as having no current audio track.
{
  assert.strictEqual(currentAudioTrack(endedStream('ended-track')), null, 'all-ended streams have no current audio track');
}

// CR-FIX-4 — syncPeers removes an existing publisher when the same client now has only ended audio.
{
  const { elements } = installFakeDom();
  const service = new RemoteAudioService();
  service.setInCallActive(true);
  const mediaStream = stream('track-a');

  service.syncPeers([peer('client-a', mediaStream)]);
  await waitFor(() => elements.length === 1 && elements[0].calls.includes('play'));

  service.syncPeers([peer('client-a', endedStream('track-ended'))]);

  assert.strictEqual(elements[0].removed, true, 'ended-only replacement removes the existing registry element');
  assert.deepStrictEqual(service.debugSnapshot().registryPeerIds, [], 'ended-only replacement leaves no registered publisher');
  assert.strictEqual(service.remoteAudioBlocked(), false, 'ended-only removal does not leave the unblock banner latched');
}

// CR-FIX-4 — unplayable source errors do not show the gesture-unblock banner or replay forever as NotAllowed.
{
  installFakeDom({ playReject: { name: 'NotSupportedError' } });
  const service = new RemoteAudioService();
  service.setInCallActive(true);
  await service.addPublisher('client-a', stream('track-a'));

  assert.strictEqual(service.remoteAudioBlocked(), false, 'NotSupportedError does not set tap-to-enable banner state');
  assert.strictEqual(service.outputPlaying(), true, 'unsupported playback is bounded out of the blocked/replay lane');
  assert.strictEqual(service.playoutDiagnostics().perPublisher[0].blockedReason, null, 'unsupported playback failure does not disagree with aggregate blocked state');
}

// CR-FIX-6 — sink apply resolving after reset does not write stale state back into a removed entry.
{
  const { elements } = installFakeDom();
  const service = new RemoteAudioService();
  service.setInCallActive(true);
  await service.addPublisher('client-a', stream('track-a'));
  const sinkApply = deferred();
  elements[0].setSinkId = async (sinkId: string): Promise<void> => {
    elements[0].calls.push(`delayedSetSinkId:${sinkId}`);
    await sinkApply.promise;
    elements[0].sinkId = sinkId;
  };

  const applying = service.applyOutputDevice('late-speaker');
  await waitFor(() => elements[0].calls.includes('delayedSetSinkId:late-speaker'));
  service.reset();
  sinkApply.resolve();
  const result = await applying;

  assert.strictEqual(result, 'selected', 'stale apply resolves without surfacing an error');
  assert.deepStrictEqual(service.playoutDiagnostics().perPublisher, [], 'reset registry remains empty after stale sink apply resolves');
  assert.strictEqual(service.playoutDiagnostics().selectedAudioOutputId, null, 'stale sink apply does not restore selected sink after reset');
  assert.strictEqual(service.playoutDiagnostics().effectiveSinkId, null, 'stale sink apply does not restore effective sink after reset');
  assert.strictEqual(service.playoutDiagnostics().usedFallback, false, 'stale sink apply does not restore fallback state after reset');
  assert.strictEqual(service.remoteAudioBlocked(), false, 'stale sink apply cannot relatch aggregate blocked state after reset');
  assert.strictEqual(elements[0].removed, true, 'reset removed the original publisher element');
}

// CR-FIX-1 — syncPeers replaces a publisher when the audio track changes on the same MediaStream.
{
  const { elements } = installFakeDom();
  const service = new RemoteAudioService();
  service.setInCallActive(true);
  const firstTrack = new FakeTrack('track-a');
  const mediaStream = new FakeMediaStream([firstTrack]) as unknown as FakeMediaStream & MediaStream;

  service.syncPeers([peer('client-a', mediaStream)]);
  await waitFor(() => elements.length === 1 && elements[0].calls.includes('play'));

  mediaStream.replaceAudioTrack(new FakeTrack('track-b'));
  service.syncPeers([peer('client-a', mediaStream)]);
  await waitFor(() => elements.length === 2 && elements[1].calls.includes('play'));

  assert.strictEqual(elements[0].removed, true, 'old same-stream audio track element is removed');
  assert.strictEqual(elements[1].dataset['remoteAudio'], 'client-a');
  assert.deepStrictEqual(service.debugSnapshot().registryTrackIds, ['track-b'], 'registry follows the replacement audio track');
}

// RA-REG-6 — re-adding the same publisher leaves exactly one connected element for that client id.
{
  const { elements } = installFakeDom();
  const service = new RemoteAudioService();
  service.setInCallActive(true);
  await service.addPublisher('client-a', stream('track-a'));
  await service.addPublisher('client-a', stream('track-b'));

  const connected = elements.filter((el) => el.isConnected && !el.removed);
  assert.strictEqual(connected.length, 1);
  assert.strictEqual(connected[0].dataset['remoteAudio'], 'client-a');
  assert.strictEqual(elements[0].removed, true, 'old publisher element is removed before replacement lives');
}

// RA-REG-7 — stored mixer-era >100% volume migrates to native-safe 100%.
{
  const { localStorage } = installFakeDom('1.3');
  const service = new RemoteAudioService();
  assert.strictEqual(service.volume(), 1);
  assert.strictEqual(localStorage.get('meet-poc:volume:value'), '1');
}

// RA-LEVEL-1 — quiet speakers are raised toward a genuinely loud (>=absolute target) active
// speaker without clipping. D28: reference = max(loudest, ABS_TARGET=0.5), so a loud peer at
// or above the absolute target still anchors the reference exactly as before the fix.
{
  const gains = computeRemoteAutoGains([
    { publisherClientId: 'quiet', audioLevel: 0.05 },
    { publisherClientId: 'loud', audioLevel: 0.5 },
    { publisherClientId: 'noise', audioLevel: 0.0001 },
  ]);
  assert.ok(gains.quiet > 1, 'quiet speaker receives gain');
  assert.ok(gains.quiet <= 2.5, 'quiet gain is capped');
  assert.strictEqual(gains.loud, 1, 'loudest speaker is not boosted');
  assert.strictEqual(gains.noise, 1, 'noise-floor samples are not amplified');
}

console.log('remote-audio.service: all assertions passed');
