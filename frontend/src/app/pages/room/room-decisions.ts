import {
  decideVoiceRecovery,
  sampleWindowHasVoiceEnergy,
  voiceRecoveryWindowExhaustedWhileStalled,
  VOICE_RECOVERY_SAMPLE_WINDOW,
  type VoiceRecoverySample,
  type VoiceRecoveryStep,
} from '../../services/remote-audio.service';

export type ChatSubmitKeyEvent = {
  key?: string;
  shiftKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
};

export function shouldSubmitChat(event: ChatSubmitKeyEvent): boolean {
  if (event.key !== 'Enter') return false;
  if (event.shiftKey) return false;
  if (event.isComposing || event.keyCode === 229) return false;
  return true;
}

export type GuestPasswordPromptInput = {
  passwordRequired: boolean;
  isOwner: boolean;
  verifiedPassword: string | null;
};

export function shouldPromptGuestPassword(input: GuestPasswordPromptInput): boolean {
  return input.passwordRequired && !input.isOwner && !input.verifiedPassword;
}

export type DeviceSelectionAttemptInput = {
  attemptSucceeded: boolean;
  previousStoredId: string;
  acquiredDeviceId?: string;
};

export function storedDeviceAfterSelectionAttempt(input: DeviceSelectionAttemptInput): string {
  if (!input.attemptSucceeded) return input.previousStoredId;
  return input.acquiredDeviceId ?? '';
}

export function shouldClearVideoPinAfterRefresh(input: { selectedDeviceId: string; availableDeviceIds: string[] }): boolean {
  return !!input.selectedDeviceId && !input.availableDeviceIds.includes(input.selectedDeviceId);
}

export function shouldReconcileAudioOutputAfterRefresh(input: { selectedDeviceId: string; availableDeviceIds: string[] }): boolean {
  return !!input.selectedDeviceId && !input.availableDeviceIds.includes(input.selectedDeviceId);
}

export function shouldAcquireMicTrackForToggle(input: { trackExists: boolean; trackReadyState?: MediaStreamTrackState }): boolean {
  return !input.trackExists || input.trackReadyState !== 'live';
}

export function shouldRearmLobbySelfTest(input: { inLobby: boolean; audioActivated: boolean; alreadyRunning: boolean }): boolean {
  return input.inLobby && input.audioActivated && !input.alreadyRunning;
}

export type LocalTrackFailureRecoveryAction = 'ignore' | 'debounce-mute' | 'recover-ended';

export function decideLocalTrackFailureRecovery(input: {
  inCall: boolean;
  currentTrack: boolean;
  trackEnabled: boolean;
  event: 'ended' | 'mute';
  trackReadyState: MediaStreamTrackState;
}): LocalTrackFailureRecoveryAction {
  if (!input.inCall || !input.currentTrack || !input.trackEnabled) return 'ignore';
  if (input.event === 'mute' && input.trackReadyState === 'live') return 'debounce-mute';
  return 'recover-ended';
}

export type RemoteVoiceWatchdogAction =
  | { kind: 'clear'; deletePeer: boolean; nextSamples: VoiceRecoverySample[]; nextAttemptsThisWindow: number }
  | { kind: 'note-emission-advanced'; nextSamples: VoiceRecoverySample[]; nextAttemptsThisWindow: number }
  | { kind: 'recover'; recoveryAction: VoiceRecoveryStep; nextSamples: VoiceRecoverySample[]; nextAttemptsThisWindow: number }
  | { kind: 'mark-stalled'; nextSamples: VoiceRecoverySample[]; nextAttemptsThisWindow: number }
  | { kind: 'hold'; nextSamples: VoiceRecoverySample[]; nextAttemptsThisWindow: number };

export function decideRemoteVoiceWatchdogAction(input: {
  previousSamples: VoiceRecoverySample[];
  attemptsThisWindow: number;
  sample: VoiceRecoverySample | null;
  mutedAll: boolean;
}): RemoteVoiceWatchdogAction {
  if (input.mutedAll) return { kind: 'clear', deletePeer: false, nextSamples: [], nextAttemptsThisWindow: 0 };
  if (!input.sample) return { kind: 'clear', deletePeer: true, nextSamples: [], nextAttemptsThisWindow: 0 };

  const samples = [...input.previousSamples, input.sample];
  if (samples.length > VOICE_RECOVERY_SAMPLE_WINDOW) samples.shift();

  if (remoteVoiceEmittedClimbed(samples)) {
    return { kind: 'note-emission-advanced', nextSamples: [input.sample], nextAttemptsThisWindow: 0 };
  }

  if (samples.length >= VOICE_RECOVERY_SAMPLE_WINDOW && !remoteVoiceBytesClimbed(samples)) {
    return { kind: 'clear', deletePeer: false, nextSamples: [input.sample], nextAttemptsThisWindow: 0 };
  }

  const action = decideVoiceRecovery({
    samples,
    attemptsThisWindow: input.attemptsThisWindow,
    mutedAll: input.mutedAll,
  });

  if (action === 'none') {
    if (
      voiceRecoveryWindowExhaustedWhileStalled({
        samples,
        attemptsThisWindow: input.attemptsThisWindow,
        mutedAll: input.mutedAll,
      })
    ) {
      return { kind: 'mark-stalled', nextSamples: samples, nextAttemptsThisWindow: input.attemptsThisWindow };
    }
    if (samples.length >= VOICE_RECOVERY_SAMPLE_WINDOW && !sampleWindowHasVoiceEnergy(samples)) {
      return { kind: 'clear', deletePeer: false, nextSamples: [input.sample], nextAttemptsThisWindow: 0 };
    }
    return { kind: 'hold', nextSamples: samples, nextAttemptsThisWindow: input.attemptsThisWindow };
  }

  return {
    kind: 'recover',
    recoveryAction: action,
    nextSamples: [input.sample],
    nextAttemptsThisWindow: input.attemptsThisWindow + 1,
  };
}

function remoteVoiceEmittedClimbed(samples: VoiceRecoverySample[]): boolean {
  if (samples.length < 2) return false;
  return samples[samples.length - 1].emitted > samples[samples.length - 2].emitted;
}

function remoteVoiceBytesClimbed(samples: VoiceRecoverySample[]): boolean {
  if (samples.length < 2) return false;
  return samples[samples.length - 1].bytes > samples[0].bytes;
}
