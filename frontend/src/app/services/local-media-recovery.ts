export type LocalAudioRecoveryErrorClass = 'permission-denied' | 'in-use' | 'no-mic' | 'unknown';

const CONNECT_MIC_MESSAGE = 'No microphone available. Connect a microphone, then choose it from devices.';
const REGRANT_MIC_MESSAGE = 'Microphone permission was blocked. Re-grant mic permission in site settings, then rejoin.';
const MIC_IN_USE_MESSAGE = 'Your microphone is being used by another app. Close the other app using your mic, then click the mic button.';
const FALLBACK_MIC_MESSAGE = 'Microphone recovery failed. Check your microphone, permissions, and other apps, then click the mic button.';

export function classifyLocalAudioRecoveryError(err: unknown): LocalAudioRecoveryErrorClass {
  const value = err as { name?: string; message?: string; code?: string };
  if (value?.code === 'denied' || value?.name === 'NotAllowedError' || value?.name === 'PermissionDeniedError') {
    return 'permission-denied';
  }
  if (
    value?.code === 'in-use'
    || value?.name === 'NotReadableError'
    || value?.name === 'TrackStartError'
    || /in use|busy|could not start/i.test(String(value?.message || ''))
  ) {
    return 'in-use';
  }
  if (
    value?.code === 'no-devices'
    || value?.name === 'NotFoundError'
    || value?.name === 'DevicesNotFoundError'
    || value?.name === 'OverconstrainedError'
    || value?.name === 'ConstraintNotSatisfiedError'
  ) {
    return 'no-mic';
  }
  return 'unknown';
}

export function localAudioRecoveryTerminalMessage(err: unknown): string {
  const errorClass = classifyLocalAudioRecoveryError(err);
  if (errorClass === 'permission-denied') return REGRANT_MIC_MESSAGE;
  if (errorClass === 'in-use') return MIC_IN_USE_MESSAGE;
  if (errorClass === 'no-mic') return CONNECT_MIC_MESSAGE;
  return FALLBACK_MIC_MESSAGE;
}
