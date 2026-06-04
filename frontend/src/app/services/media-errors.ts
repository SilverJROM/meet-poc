export type MediaError = { code: 'denied' | 'no-devices' | 'in-use' | 'unknown'; message: string };

export function normalizeMediaError(err: unknown): MediaError {
  const value = err as { name?: string; message?: string };
  if (value?.name === 'NotAllowedError' || value?.name === 'PermissionDeniedError') {
    return { code: 'denied', message: 'Media permission denied' };
  }
  if (
    value?.name === 'NotFoundError'
    || value?.name === 'DevicesNotFoundError'
    || value?.name === 'OverconstrainedError'
    || value?.name === 'ConstraintNotSatisfiedError'
  ) {
    return { code: 'no-devices', message: 'No devices found' };
  }
  if (
    value?.name === 'NotReadableError'
    || value?.name === 'TrackStartError'
    || /in use|busy|could not start/i.test(String(value?.message || ''))
  ) {
    return { code: 'in-use', message: 'Camera or microphone is in use by another app or tab' };
  }
  return { code: 'unknown', message: String(value?.message || err) };
}
