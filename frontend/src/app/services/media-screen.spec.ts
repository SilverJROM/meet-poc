import assert from 'node:assert/strict';
import { createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { MediaService } from './media.service.js';
import { ViewportService } from './viewport.service.js';

type FakeTrack = MediaStreamTrack & { stopCount: number; emitEnded: () => void };

function createMediaService(): MediaService {
  const injector = createEnvironmentInjector([
    { provide: ViewportService, useValue: { isMobile: () => false } },
  ]);
  return runInInjectionContext(injector, () => new MediaService());
}

function installDisplayMedia(streams: MediaStream[]): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { __activeTracks: [] },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getDisplayMedia: async () => {
          const stream = streams.shift();
          if (!stream) throw new Error('missing fake display stream');
          return stream;
        },
        getUserMedia: async () => {
          throw new Error('not used by this spec');
        },
      },
    },
  });
}

function fakeScreenStream(): { stream: MediaStream; track: FakeTrack } {
  const track = {
    readyState: 'live',
    stopCount: 0,
    contentHint: '',
    onended: null,
    stop(): void {
      this.readyState = 'ended';
      this.stopCount += 1;
    },
    emitEnded(): void {
      this.readyState = 'ended';
      this.onended?.(new Event('ended'));
    },
  } as FakeTrack;
  const stream = {
    getAudioTracks: () => [],
    getVideoTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
  return { stream, track };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

// Start publish failure rolls back local screen state and stops only the new display track.
{
  const screen = fakeScreenStream();
  installDisplayMedia([screen.stream]);
  const media = createMediaService();

  await assert.rejects(
    media.toggleScreen(async (track) => {
      assert.equal(track, screen.track, 'start callback receives acquired screen track');
      throw new Error('publish failed');
    }),
    /publish failed/,
  );

  assert.equal(media.screenOn(), false, 'failed publish restores screen-off state');
  assert.equal(media.screenStream(), null, 'failed publish clears screen stream');
  assert.equal(screen.track.readyState, 'ended', 'failed publish stops acquired display track');
  assert.equal(screen.track.stopCount, 1, 'failed publish stops display track once');
}

// Stop waits for the SFU callback before stopping/clearing local screen state.
{
  const screen = fakeScreenStream();
  installDisplayMedia([screen.stream]);
  const media = createMediaService();
  await media.toggleScreen(async () => {});

  let releaseStop!: () => void;
  const stopGate = new Promise<void>((resolve) => {
    releaseStop = resolve;
  });
  let callbackStarted = false;
  const stopPromise = media.toggleScreen(async (track) => {
    callbackStarted = true;
    assert.equal(track, null, 'stop callback receives replacement local camera track');
    assert.equal(media.screenOn(), true, 'screen state is still on while SFU stop is pending');
    assert.equal(screen.track.readyState, 'live', 'screen track is still live while SFU stop is pending');
    await stopGate;
  });

  await flush();
  assert.equal(callbackStarted, true, 'stop callback started');
  assert.equal(media.screenOn(), true, 'screen state is not cleared before callback resolves');
  assert.equal(screen.track.readyState, 'live', 'screen track is not stopped before callback resolves');

  releaseStop();
  await stopPromise;

  assert.equal(media.screenOn(), false, 'screen state clears after callback success');
  assert.equal(media.screenStream(), null, 'screen stream clears after callback success');
  assert.equal(screen.track.readyState, 'ended', 'screen track stops after callback success');
}

// Stop callback failure keeps the local screen state so the close can be retried.
{
  const screen = fakeScreenStream();
  installDisplayMedia([screen.stream]);
  const media = createMediaService();
  await media.toggleScreen(async () => {});

  await assert.rejects(
    media.toggleScreen(async () => {
      throw new Error('close failed');
    }),
    /close failed/,
  );

  assert.equal(media.screenOn(), true, 'failed close keeps screen state on');
  assert.equal(media.screenStream(), screen.stream, 'failed close keeps screen stream');
  assert.equal(screen.track.readyState, 'live', 'failed close keeps screen track live');
}

console.log('media-screen: all assertions passed');
