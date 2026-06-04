import assert from 'node:assert/strict';
import {
  acquireAudio,
  acquireVideo,
  createMediaAcquisitionQueue,
  resolvedAcquiredDeviceId,
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

// U-5 — exact success keeps the requested id even if the track reports a generic alias.
{
  assert.strictEqual(
    resolvedAcquiredDeviceId({ requestedDeviceId: 'mic-1', acquiredDeviceId: 'default', stage: 'exact' }),
    'mic-1',
    'exact success keeps requested id',
  );
}

// U-6 — real fallback adopts the actual acquired device so storage is not pinned to a dead id.
{
  assert.strictEqual(
    resolvedAcquiredDeviceId({ requestedDeviceId: 'mic-dead', acquiredDeviceId: 'mic-live', stage: 'default' }),
    'mic-live',
    'default fallback adopts concrete acquired device',
  );
  assert.strictEqual(
    resolvedAcquiredDeviceId({ requestedDeviceId: 'cam-dead', acquiredDeviceId: 'cam-live', stage: 'ideal' }),
    'cam-live',
    'ideal fallback adopts concrete acquired device',
  );
}

// U-7 — empty/generic reports never clobber the requested id after fallback.
{
  assert.strictEqual(
    resolvedAcquiredDeviceId({ requestedDeviceId: 'mic-1', acquiredDeviceId: '', stage: 'default' }),
    'mic-1',
    'empty acquired id does not clobber requested id',
  );
  assert.strictEqual(
    resolvedAcquiredDeviceId({ requestedDeviceId: 'mic-1', acquiredDeviceId: 'default', stage: 'default' }),
    'mic-1',
    'generic default id does not clobber requested id',
  );
  assert.strictEqual(
    resolvedAcquiredDeviceId({ requestedDeviceId: 'mic-1', acquiredDeviceId: 'communications', stage: 'ideal' }),
    'mic-1',
    'generic communications id does not clobber requested id',
  );
}

// U-8 — audio/video acquisition never combines constraints, and failed video resolves null.
{
  const calls: MediaStreamConstraints[] = [];
  const getUserMedia: GetUserMediaFn = async (constraints) => {
    calls.push(constraints);
    if (constraints.audio) return fakeStream('audio');
    throw new Error('No camera available');
  };
  const queue = createMediaAcquisitionQueue(getUserMedia);

  const audio = await acquireAudio(queue, { baseConstraints: { echoCancellation: { ideal: true } } });
  const video = await acquireVideo(queue, { baseConstraints: { width: { ideal: 854 }, height: { ideal: 480 } } });

  assert.strictEqual(audio.track.readyState, 'live', 'audio acquisition still must succeed');
  assert.strictEqual(video, null, 'camera failure is optional and resolves null');
  assert.strictEqual(calls.length, 2, 'audio and video are requested as separate getUserMedia calls');
  assert.deepStrictEqual(
    calls.map((constraints) => ({ audio: !!constraints.audio, video: !!constraints.video })),
    [
      { audio: true, video: false },
      { audio: false, video: true },
    ],
    'no getUserMedia call combines audio and video',
  );
}

// U-9 / A12 — a wrong in-call mic id follows the shared acquireAudio ladder.
{
  const calls: MediaStreamConstraints[] = [];
  const getUserMedia: GetUserMediaFn = async (constraints) => {
    calls.push(constraints);
    const audio = constraints.audio as MediaTrackConstraints;
    if (JSON.stringify(audio.deviceId) === JSON.stringify({ exact: 'dead-mic' })) {
      throw Object.assign(new Error('wrong mic'), { name: 'OverconstrainedError' });
    }
    return fakeStream('audio');
  };
  const queue = createMediaAcquisitionQueue(getUserMedia);

  const acquired = await acquireAudio(queue, { deviceId: 'dead-mic', baseConstraints: { echoCancellation: { ideal: true } } });

  assert.strictEqual(acquired.stage, 'ideal', 'A12: exact failure retries through ideal before succeeding');
  assert.deepStrictEqual(
    calls.map((constraints) => (constraints.audio as MediaTrackConstraints).deviceId),
    [{ exact: 'dead-mic' }, { ideal: 'dead-mic' }],
    'A12: wrong id uses exact→ideal through the shared acquireAudio ladder',
  );
  assert.strictEqual(acquired.track.readyState, 'live', 'A12: fallback acquisition returns a live mic track');
}

function fakeStream(kind: MediaAcquireKind): MediaStream {
  const track: { readyState: MediaStreamTrackState; stop: () => void } = {
    readyState: 'live',
    stop(): void {
      this.readyState = 'ended';
    },
  };
  const mediaTrack = track as unknown as MediaStreamTrack;

  return {
    getAudioTracks: () => (kind === 'audio' ? [mediaTrack] : []),
    getVideoTracks: () => (kind === 'video' ? [mediaTrack] : []),
    getTracks: () => [mediaTrack],
  } as unknown as MediaStream;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

console.log('media-acquisition: all assertions passed');
