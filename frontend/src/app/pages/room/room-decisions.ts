import {
  decideVoiceRecovery,
  voiceRecoveryWindowExhaustedWhileStalled,
  VOICE_RECOVERY_SAMPLE_WINDOW,
  type VoiceRecoverySample,
  type VoiceRecoveryStep,
} from '../../services/remote-audio.service';
import { type MicCaptureClass } from '../../services/mic-energy';

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
  | { kind: 'escalate-recovery'; nextSamples: VoiceRecoverySample[]; nextAttemptsThisWindow: number }
  | { kind: 'hold'; nextSamples: VoiceRecoverySample[]; nextAttemptsThisWindow: number };

// R3: distinguishes healthy silence (publisher mic off) from broken inbound audio (no RTP at all,
// or bytes arriving with emitted/energy stalled) — both broken shapes now escalate into the shared
// SFU recovery coordinator (scheduleRecoveryEscalation) instead of a silent terminal give-up.
export function decideRemoteVoiceWatchdogAction(input: {
  previousSamples: VoiceRecoverySample[];
  attemptsThisWindow: number;
  sample: VoiceRecoverySample | null;
  mutedAll: boolean;
  publisherMicEnabled?: boolean;
}): RemoteVoiceWatchdogAction {
  if (input.mutedAll) return { kind: 'clear', deletePeer: false, nextSamples: [], nextAttemptsThisWindow: 0 };
  if (!input.sample) return { kind: 'clear', deletePeer: true, nextSamples: [], nextAttemptsThisWindow: 0 };

  const samples = [...input.previousSamples, input.sample];
  if (samples.length > VOICE_RECOVERY_SAMPLE_WINDOW) samples.shift();

  if (remoteVoiceEmittedClimbed(samples)) {
    return { kind: 'note-emission-advanced', nextSamples: [input.sample], nextAttemptsThisWindow: 0 };
  }

  if (samples.length >= VOICE_RECOVERY_SAMPLE_WINDOW && !remoteVoiceBytesClimbed(samples)) {
    // No inbound bytes at all for an advertised audio track past the grace window (this sample
    // window). mic off ⇒ healthy silence; mic on/unknown ⇒ subscribed-no-RTP failure ⇒ coordinator.
    if (input.publisherMicEnabled === false) {
      return { kind: 'clear', deletePeer: false, nextSamples: [input.sample], nextAttemptsThisWindow: 0 };
    }
    return { kind: 'escalate-recovery', nextSamples: [input.sample], nextAttemptsThisWindow: 0 };
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
      return { kind: 'escalate-recovery', nextSamples: samples, nextAttemptsThisWindow: input.attemptsThisWindow };
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

// ── Pre-join device gate (preflight) ──────────────────────────────────────────

export type PreflightGateStatus =
  | 'pending'          // preflight not yet started or device check running
  | 'mic-fail'         // classifyMicCapture → silent; gate blocks join
  | 'speaker-needed'   // mic ok; speaker test not yet done
  | 'ready'            // mic verified + speaker tested → join unblocked
  | 'audio-connecting' // post-admit: publishInitialSfuWithRetry in flight
  | 'audio-failed';    // retries exhausted or publish never triggered

// R8 persistence fix: extracted from syncSelectedAudioIdToTrack so the regression
// (selecting a non-default mic, reloading, getting the old/default mic back) is testable.
export type FallbackChosenIdInput = {
  requestedDeviceId: string;
  trackReportedId: string;
  stage: 'exact' | 'default' | 'none';
};

/** Returns the fallbackChosenId for syncSelectedAudioIdToTrack. Preserves
 *  requestedDeviceId when the track reports a generic id ('default', 'communications', '')
 *  instead of losing the selection by falling back to ''. */
export function fallbackChosenIdForAudioSync(input: FallbackChosenIdInput): string {
  const { requestedDeviceId, trackReportedId, stage } = input;
  if (requestedDeviceId && stage !== 'exact' && trackReportedId !== requestedDeviceId) {
    const isGeneric = trackReportedId === '' || trackReportedId === 'default' || trackReportedId === 'communications';
    return isGeneric ? requestedDeviceId : trackReportedId;
  }
  return requestedDeviceId;
}

// Publish gate status derivation — used to test that all never-publish paths reach
// 'audio-failed' (never silent in-call). publishTriggerCount===0 diagnoses PATH A.
export type PublishGateInput = {
  triggerFired: boolean;          // publishTriggerCount > 0 at end of session
  publishFailed: boolean;         // retries exhausted (permanent or capped)
  stateReverted: boolean;         // state left 'in-call' during retry → silent early-return
  noLiveAudioAtDeadline: boolean; // initialPublishStream threw on no live track
};

export function derivePublishGateStatus(input: PublishGateInput): 'audio-connecting' | 'audio-failed' {
  if (!input.triggerFired || input.publishFailed || input.stateReverted || input.noLiveAudioAtDeadline) {
    return 'audio-failed';
  }
  return 'audio-connecting';
}

// ── micWorking positive signal reducer (CR-FIX-2) ────────────────────────────
// Distinct from nextMicWarningState (which is a WARNING flag: true=silent).
// This reducer is the POSITIVE "mic has confirmed energy" signal:
//   micActive=false → false (mic off = not verified)
//   'working'       → true
//   'silent'        → false
//   'indeterminate' → current (no flicker; keep state until a decisive sample)
export function nextMicWorkingState(
  current: boolean,
  classification: MicCaptureClass,
  micActive: boolean,
): boolean {
  if (!micActive) return false;
  if (classification === 'working') return true;
  if (classification === 'silent') return false;
  return current; // 'indeterminate' — no change.
}

// Gate prereqs: mic ACCESS only (R10 + red-team fix).
// A live mic track is sufficient to join — a silent-but-accessible mic must NOT block join.
// Silent users join; in-call watchdogs surface 'No sound' after admit.
export type PreflightPrereqsInput = {
  hasMicAccess: boolean;
};

export function missingPreflightPrereqs(input: PreflightPrereqsInput): ('mic')[] {
  const missing: ('mic')[] = [];
  if (!input.hasMicAccess) {
    missing.push('mic');
  }
  console.log('[GATE] missingPreflightPrereqs input:', input, 'missing:', missing);
  return missing;
}

// Publish-flow finally-block guard (CR-FIX-1).
// Returns true when the finally block should surface an audio-failed — i.e., the
// publish attempt ended without success and the gate is still stuck at
// 'audio-connecting'. The preflightGateStatus check prevents a double-set when
// the inner retry logic already set 'audio-failed' before returning.
export type ShouldSurfacePublishFailureInput = {
  publishSucceeded: boolean;
  gateStatus: PreflightGateStatus;
};
export function shouldSurfacePublishFailure(input: ShouldSurfacePublishFailureInput): boolean {
  return !input.publishSucceeded && input.gateStatus === 'audio-connecting';
}

// ── R9: peer audio-health classification (host-badge signal) ──────────────────

export type PeerAudioHealthInput = {
  isPublishing: boolean;        // peer appears in remotePublishers (has sent audio to SFU)
  hasTrack: boolean;            // inbound-rtp audio track exists for this peer at the host
  bytesReceivedNow: number | null;
  bytesReceivedPrev: number | null;
  micEnabled: boolean;          // peer's mic is on (muted peer must not be badged)
  pastGrace: boolean;           // grace window has elapsed since peer was admitted
};

export type PeerAudioHealthResult = 'ok' | 'no-track' | 'never-published' | 'stalled';

export function classifyPeerAudioHealth(input: PeerAudioHealthInput): PeerAudioHealthResult {
  if (!input.micEnabled) return 'ok';               // muted — no badge
  if (!input.pastGrace) return 'ok';                 // subscription setup window — no flicker
  if (!input.isPublishing) return 'never-published'; // admitted + past grace + never published (Joanne)
  if (!input.hasTrack || input.bytesReceivedNow === null) return 'no-track';
  if (input.bytesReceivedPrev !== null && input.bytesReceivedNow <= input.bytesReceivedPrev) return 'stalled';
  return 'ok';
}

// R9: quiet-guest policy — in-call audio failure surfaces (device dialog + notice)
// are host-only. Non-host guests get silent background retry + host badge.
export function shouldOpenDeviceDialogOnAudioFail(input: { isHost: boolean }): boolean {
  return input.isHost;
}

export function shouldShowAudioFailNotice(input: { isHost: boolean }): boolean {
  return input.isHost;
}

// R10(i): empty-transceiver invariant — extracted for unit-testing.
// Throws when the transceiver is absent so the caller fails loudly instead of silently.
export function requireLiveTransceiver<T>(transceiver: T | null | undefined): T {
  if (transceiver == null) throw new Error('[sfu] no live audio transceiver — track cannot be published');
  return transceiver;
}
