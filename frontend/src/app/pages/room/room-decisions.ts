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

export function shouldAcquireMicTrackForToggle(input: { trackExists: boolean; trackReadyState?: MediaStreamTrackState }): boolean {
  return !input.trackExists || input.trackReadyState !== 'live';
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
