export type MediaAcquireKind = 'audio' | 'video';
export type MediaAcquireStage = 'exact' | 'ideal' | 'default' | 'none';

export interface ResolveMediaConstraintsInput {
  kind: MediaAcquireKind;
  stage: MediaAcquireStage;
  deviceId?: string;
  facingMode?: 'user' | 'environment';
  baseConstraints?: MediaTrackConstraints;
}

export interface ResolveNextOnErrorInput {
  kind: MediaAcquireKind;
  failedStage: MediaAcquireStage;
}

export interface MediaAcquisitionResult {
  stream: MediaStream;
  track: MediaStreamTrack;
  constraints: MediaTrackConstraints;
  stage: Exclude<MediaAcquireStage, 'none'>;
}

export type GetUserMediaFn = (constraints: MediaStreamConstraints) => Promise<MediaStream>;

export interface MediaAcquisitionQueue {
  run<T>(operation: (getUserMedia: GetUserMediaFn) => Promise<T>): Promise<T>;
  acquire(constraints: MediaStreamConstraints): Promise<MediaStream>;
}

export interface AcquireMediaOptions {
  deviceId?: string;
  facingMode?: 'user' | 'environment';
  baseConstraints?: MediaTrackConstraints;
}

export interface ResolveAcquiredDeviceIdInput {
  requestedDeviceId?: string;
  acquiredDeviceId?: string;
  stage: Exclude<MediaAcquireStage, 'none'>;
}

export function resolveInitialStage(deviceId?: string): Exclude<MediaAcquireStage, 'ideal' | 'none'> {
  return deviceId ? 'exact' : 'default';
}

export function resolveConstraints(input: ResolveMediaConstraintsInput): false | MediaTrackConstraints {
  if (input.stage === 'none') return false;

  const constraints: MediaTrackConstraints = { ...(input.baseConstraints ?? {}) };
  if (input.stage === 'exact' && input.deviceId) {
    constraints.deviceId = { exact: input.deviceId };
  } else if (input.stage === 'ideal' && input.deviceId) {
    constraints.deviceId = { ideal: input.deviceId };
  } else if (input.kind === 'video' && input.facingMode) {
    constraints.facingMode = input.facingMode;
  }
  return constraints;
}

export function resolveNextOnError(input: ResolveNextOnErrorInput): MediaAcquireStage | null {
  if (input.failedStage === 'exact') return 'ideal';
  if (input.failedStage === 'ideal') return 'default';
  if (input.failedStage === 'default' && input.kind === 'video') return 'none';
  return null;
}

export function resolvedAcquiredDeviceId(input: ResolveAcquiredDeviceIdInput): string {
  const requested = input.requestedDeviceId ?? '';
  const acquired = input.acquiredDeviceId ?? '';
  if (input.stage === 'exact') return requested || acquired;
  if (acquired && !isGenericAcquiredDeviceId(acquired)) return acquired;
  return requested;
}

export function createMediaAcquisitionQueue(getUserMedia: GetUserMediaFn): MediaAcquisitionQueue {
  let tail: Promise<void> = Promise.resolve();

  return {
    run<T>(operation: (queuedGetUserMedia: GetUserMediaFn) => Promise<T>): Promise<T> {
      const run = tail.then(() => operation(getUserMedia));
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },

    acquire(constraints: MediaStreamConstraints): Promise<MediaStream> {
      return this.run((queuedGetUserMedia) => queuedGetUserMedia(constraints));
    },
  };
}

export async function acquireAudio(queue: MediaAcquisitionQueue, options: AcquireMediaOptions = {}): Promise<MediaAcquisitionResult> {
  const result = await acquireWithFallback(queue, 'audio', options);
  if (!result) throw new Error('No microphone track acquired');
  return result;
}

export async function acquireVideo(queue: MediaAcquisitionQueue, options: AcquireMediaOptions = {}): Promise<MediaAcquisitionResult | null> {
  return acquireWithFallback(queue, 'video', options);
}

async function acquireWithFallback(
  queue: MediaAcquisitionQueue,
  kind: MediaAcquireKind,
  options: AcquireMediaOptions,
): Promise<MediaAcquisitionResult | null> {
  return queue.run(async (getUserMedia) => {
    let stage: MediaAcquireStage = resolveInitialStage(options.deviceId);
    let lastError: unknown = null;

    while (stage !== 'none') {
      const constraints = resolveConstraints({ kind, stage, ...options });
      if (!constraints) return null;

      try {
        const stream = await getUserMedia({
          audio: kind === 'audio' ? constraints : false,
          video: kind === 'video' ? constraints : false,
        });
        const track = kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
        if (track) return { stream, track, constraints, stage };

        stopStream(stream);
        lastError = new Error(`No ${kind} track acquired`);
      } catch (err) {
        lastError = err;
      }

      const next = resolveNextOnError({ kind, failedStage: stage });
      if (!next) {
        if (kind === 'video') return null;
        throw lastError;
      }
      stage = next;
    }

    return null;
  });
}

function stopStream(stream: MediaStream): void {
  stream.getTracks().forEach((track) => {
    if (track.readyState !== 'ended') track.stop();
  });
}

function isGenericAcquiredDeviceId(id: string): boolean {
  return id === '' || id === 'default' || id === 'communications';
}
