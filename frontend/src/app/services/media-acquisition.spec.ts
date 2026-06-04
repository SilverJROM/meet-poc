import assert from 'node:assert/strict';
import {
  acquireAudio,
  acquireVideo,
  createMediaAcquisitionQueue,
  resolveConstraints,
  resolveNextOnError,
  type GetUserMediaFn,
  type MediaAcquireKind,
} from './media-acquisition.js';

// U-1 — selected exact-device failure advances to selected ideal-device constraints.
{
  const exact = resolveConstraints({ kind: 'audio', stage: 'exact', deviceId: 'mic-1', baseConstraints: { echoCancellation: { ideal: true } } });
  assert.deepStrictEqual((exact as MediaTrackConstraints).deviceId, { exact: 'mic-1' }, 'selected device starts as {exact}');
  assert.strictEqual(resolveNextOnError({ kind: 'audio', failedStage: 'exact' }), 'ideal', 'exact failure advances to ideal');

  const ideal = resolveConstraints({ kind: 'audio', stage: 'ideal', deviceId: 'mic-1', baseConstraints: { echoCancellation: { ideal: true } } });
  assert.deepStrictEqual((ideal as MediaTrackConstraints).deviceId, { ideal: 'mic-1' }, 'ideal retry keeps selected device as {ideal}');
  assert.deepStrictEqual((ideal as MediaTrackConstraints).echoCancellation, { ideal: true }, 'base audio processing constraints survive fallback');
}

// U-2 — selected ideal-device failure advances to default constraints with no deviceId.
{
  assert.strictEqual(resolveNextOnError({ kind: 'audio', failedStage: 'ideal' }), 'default', 'ideal failure advances to default');
  const fallback = resolveConstraints({ kind: 'audio', stage: 'default', deviceId: 'mic-1', baseConstraints: { noiseSuppression: { ideal: true } } });
  assert.strictEqual('deviceId' in (fallback as MediaTrackConstraints), false, 'default audio retry drops deviceId');
  assert.deepStrictEqual((fallback as MediaTrackConstraints).noiseSuppression, { ideal: true }, 'default preserves base constraints');
}

// U-3 — video default failure advances to graceful none.
{
  assert.strictEqual(resolveNextOnError({ kind: 'video', failedStage: 'default' }), 'none', 'video default failure becomes graceful none');
  assert.strictEqual(resolveConstraints({ kind: 'video', stage: 'none', deviceId: 'cam-1' }), false, 'none means no video request');
}

// U-4 — concurrent audio/video acquisitions are genuine single-flight FIFO.
{
  type Pending = {
    kind: MediaAcquireKind;
    resolve: (stream: MediaStream) => void;
    reject: (err: unknown) => void;
  };

  const pending: Pending[] = [];
  const starts: MediaAcquireKind[] = [];
  const completions: string[] = [];
  let active = 0;
  let maxActive = 0;

  const getUserMedia: GetUserMediaFn = (constraints) => {
    const kind: MediaAcquireKind = constraints.audio ? 'audio' : 'video';
    starts.push(kind);
    active += 1;
    maxActive = Math.max(maxActive, active);
    return new Promise<MediaStream>((resolve, reject) => {
      pending.push({
        kind,
        resolve: (stream) => {
          active -= 1;
          resolve(stream);
        },
        reject: (err) => {
          active -= 1;
          reject(err);
        },
      });
    });
  };

  const queue = createMediaAcquisitionQueue(getUserMedia);
  const audio1 = acquireAudio(queue, { deviceId: 'mic-1' }).then(() => completions.push('audio1'));
  const video1 = acquireVideo(queue, { deviceId: 'cam-1' }).then(() => completions.push('video1'));
  const audio2 = acquireAudio(queue, { deviceId: 'mic-2' }).then(() => completions.push('audio2'));

  await flush();
  assert.deepStrictEqual(starts, ['audio'], 'only first acquisition starts immediately');
  assert.strictEqual(maxActive, 1, 'first acquisition is the only active call');

  pending[0].resolve(fakeStream('audio'));
  await audio1;
  await flush();
  assert.deepStrictEqual(completions, ['audio1'], 'first promise resolves before second starts completing');
  assert.deepStrictEqual(starts, ['audio', 'video'], 'second acquisition starts after first resolves');
  assert.strictEqual(maxActive, 1, 'second call did not overlap first');

  pending[1].resolve(fakeStream('video'));
  await video1;
  await flush();
  assert.deepStrictEqual(completions, ['audio1', 'video1'], 'second promise resolves before third starts completing');
  assert.deepStrictEqual(starts, ['audio', 'video', 'audio'], 'third acquisition starts after second resolves');
  assert.strictEqual(maxActive, 1, 'third call did not overlap second');

  pending[2].resolve(fakeStream('audio'));
  await audio2;
  await Promise.all([audio1, video1, audio2]);
  assert.deepStrictEqual(completions, ['audio1', 'video1', 'audio2'], 'concurrent requests resolve in FIFO call order');
  assert.strictEqual(maxActive, 1, 'no overlapping getUserMedia calls occurred');
}

function fakeStream(kind: MediaAcquireKind): MediaStream {
  const track = {
    readyState: 'live',
    stop(): void {
      this.readyState = 'ended';
    },
  } as MediaStreamTrack;

  return {
    getAudioTracks: () => (kind === 'audio' ? [track] : []),
    getVideoTracks: () => (kind === 'video' ? [track] : []),
    getTracks: () => [track],
  } as unknown as MediaStream;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

console.log('media-acquisition: all assertions passed');
