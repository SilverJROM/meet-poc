import assert from 'node:assert/strict';
import type { VoiceRecoverySample } from '../../services/remote-audio.service';
import {
  decideLocalTrackFailureRecovery,
  decideRemoteVoiceWatchdogAction,
  shouldAcquireMicTrackForToggle,
  shouldClearVideoPinAfterRefresh,
  shouldPromptGuestPassword,
  shouldReconcileAudioOutputAfterRefresh,
  shouldRearmLobbySelfTest,
  shouldSubmitChat,
  storedDeviceAfterSelectionAttempt,
} from './room-decisions';

function voiceSamples(values: Array<[number, number]>, energy: 'active' | 'silent' = 'active'): VoiceRecoverySample[] {
  return values.map(([bytes, emitted], index) => ({
    bytes,
    emitted,
    audioLevel: energy === 'active' ? 0.02 : 0,
    totalAudioEnergy: energy === 'active' ? index * 0.1 : 0,
  }));
}

assert.strictEqual(shouldSubmitChat({ key: 'Enter' }), true, 'plain Enter submits chat');
assert.strictEqual(shouldSubmitChat({ key: 'Enter', shiftKey: true }), false, 'Shift+Enter inserts a newline');
assert.strictEqual(shouldSubmitChat({ key: 'Enter', isComposing: true }), false, 'IME composition Enter does not submit');
assert.strictEqual(shouldSubmitChat({ key: 'Enter', keyCode: 229 }), false, 'IME keyCode 229 Enter does not submit');
assert.strictEqual(shouldSubmitChat({ key: 'a' }), false, 'non-Enter keys do not submit');

assert.strictEqual(
  shouldPromptGuestPassword({ passwordRequired: true, isOwner: false, verifiedPassword: null }),
  true,
  'protected guest without a verified password is prompted',
);
assert.strictEqual(
  shouldPromptGuestPassword({ passwordRequired: true, isOwner: false, verifiedPassword: 'secret' }),
  false,
  'stashed or verified guest password skips the prompt',
);
assert.strictEqual(
  shouldPromptGuestPassword({ passwordRequired: true, isOwner: true, verifiedPassword: null }),
  false,
  'owner does not need a password prompt',
);
assert.strictEqual(
  shouldPromptGuestPassword({ passwordRequired: false, isOwner: false, verifiedPassword: null }),
  false,
  'open room guest does not need a password prompt',
);

assert.strictEqual(
  storedDeviceAfterSelectionAttempt({ attemptSucceeded: false, previousStoredId: 'prior-good', acquiredDeviceId: 'dead-mic' }),
  'prior-good',
  'A8: failed acquisition restores the prior-good stored device id',
);
assert.strictEqual(
  storedDeviceAfterSelectionAttempt({ attemptSucceeded: false, previousStoredId: '', acquiredDeviceId: 'dead-mic' }),
  '',
  'A8: first-ever failed acquisition persists nothing',
);
assert.strictEqual(
  storedDeviceAfterSelectionAttempt({ attemptSucceeded: true, previousStoredId: 'prior-good', acquiredDeviceId: 'live-mic' }),
  'live-mic',
  'A8: successful acquisition may persist the acquired device id',
);

assert.strictEqual(
  shouldClearVideoPinAfterRefresh({ selectedDeviceId: 'missing-cam', availableDeviceIds: ['default', 'live-cam'] }),
  true,
  'A9: missing selected camera clears the exact pin before fallback',
);
assert.strictEqual(
  shouldClearVideoPinAfterRefresh({ selectedDeviceId: 'live-cam', availableDeviceIds: ['default', 'live-cam'] }),
  false,
  'A9: present selected camera keeps the exact pin',
);

assert.strictEqual(
  shouldReconcileAudioOutputAfterRefresh({ selectedDeviceId: 'missing-speaker', availableDeviceIds: ['default', 'live-speaker'] }),
  true,
  'CR-FIX-4: missing selected speaker is reconciled on refresh',
);
assert.strictEqual(
  shouldReconcileAudioOutputAfterRefresh({ selectedDeviceId: 'live-speaker', availableDeviceIds: ['default', 'live-speaker'] }),
  false,
  'CR-FIX-4: present selected speaker is kept on refresh',
);
assert.strictEqual(
  shouldReconcileAudioOutputAfterRefresh({ selectedDeviceId: '', availableDeviceIds: [] }),
  false,
  'CR-FIX-4: no selected speaker does not create an unavailable speaker state',
);

assert.strictEqual(
  shouldAcquireMicTrackForToggle({ trackExists: false }),
  true,
  'A12: no audio track routes in-call mic toggle through replacement acquisition',
);
assert.strictEqual(
  shouldAcquireMicTrackForToggle({ trackExists: true, trackReadyState: 'ended' }),
  true,
  'A12: ended audio track routes in-call mic toggle through replacement acquisition',
);
assert.strictEqual(
  shouldAcquireMicTrackForToggle({ trackExists: true, trackReadyState: 'live' }),
  false,
  'A12: live audio track keeps the existing media.toggleMic fast path',
);

assert.strictEqual(
  shouldRearmLobbySelfTest({ inLobby: true, audioActivated: true, alreadyRunning: false }),
  true,
  'ERR6: lobby audio unlock re-arms the self-test when no poller is active',
);
assert.strictEqual(
  shouldRearmLobbySelfTest({ inLobby: true, audioActivated: true, alreadyRunning: true }),
  false,
  'ERR6: active poller guard prevents duplicate lobby self-test intervals',
);
assert.strictEqual(
  shouldRearmLobbySelfTest({ inLobby: true, audioActivated: false, alreadyRunning: false }),
  false,
  'ERR6: self-test stays parked until mic preview audio is actually activated',
);
assert.strictEqual(
  shouldRearmLobbySelfTest({ inLobby: false, audioActivated: true, alreadyRunning: false }),
  false,
  'ERR6: non-lobby gestures do not start the lobby self-test',
);

assert.strictEqual(
  decideLocalTrackFailureRecovery({
    inCall: true,
    currentTrack: true,
    trackEnabled: false,
    event: 'ended',
    trackReadyState: 'ended',
  }),
  'ignore',
  'TINY6: intentionally disabled current track ending does not trigger recovery',
);
assert.strictEqual(
  decideLocalTrackFailureRecovery({
    inCall: true,
    currentTrack: true,
    trackEnabled: true,
    event: 'ended',
    trackReadyState: 'ended',
  }),
  'recover-ended',
  'TINY6: enabled current track ending still triggers recovery',
);
assert.strictEqual(
  decideLocalTrackFailureRecovery({
    inCall: true,
    currentTrack: true,
    trackEnabled: true,
    event: 'mute',
    trackReadyState: 'live',
  }),
  'debounce-mute',
  'TINY6: enabled live-track mute still schedules persistent-mute recovery',
);

{
  const previousSamples = voiceSamples([
    [1_000, 7],
    [2_000, 7],
    [3_000, 7],
  ]);
  const sample = voiceSamples([[4_000, 7]])[0];
  const decision = decideRemoteVoiceWatchdogAction({
    previousSamples,
    attemptsThisWindow: 0,
    sample,
    mutedAll: false,
  });

  assert.strictEqual(decision.kind, 'recover', 'CR-FIX-10: bytes-climbing/emitted-flat/voice-energy requests recovery');
  if (decision.kind === 'recover') {
    assert.strictEqual(decision.recoveryAction, 'resume');
    assert.deepStrictEqual(decision.nextSamples, [sample], 'CR-FIX-10: recovery rolls the watchdog window to the latest sample');
    assert.strictEqual(decision.nextAttemptsThisWindow, 1);
  }
}

{
  const previousSamples = voiceSamples([
    [1_000, 7],
    [2_000, 7],
    [3_000, 7],
  ]);
  const sample = voiceSamples([[4_000, 8]])[0];
  const decision = decideRemoteVoiceWatchdogAction({
    previousSamples,
    attemptsThisWindow: 2,
    sample,
    mutedAll: false,
  });

  assert.strictEqual(decision.kind, 'note-emission-advanced', 'CR-FIX-10: emitted climbing clears the voice-stall latch');
  assert.deepStrictEqual(decision.nextSamples, [sample]);
  assert.strictEqual(decision.nextAttemptsThisWindow, 0);
}

{
  const previousSamples = voiceSamples([
    [5_000, 7],
    [5_000, 7],
    [5_000, 7],
  ]);
  const sample = voiceSamples([[5_000, 7]])[0];
  const decision = decideRemoteVoiceWatchdogAction({
    previousSamples,
    attemptsThisWindow: 3,
    sample,
    mutedAll: false,
  });

  assert.strictEqual(decision.kind, 'clear', 'CR-FIX-10: bytes-flat clear path clears the voice-stall latch');
  if (decision.kind === 'clear') {
    assert.strictEqual(decision.deletePeer, false);
    assert.deepStrictEqual(decision.nextSamples, [sample]);
    assert.strictEqual(decision.nextAttemptsThisWindow, 0);
  }
}

{
  const decision = decideRemoteVoiceWatchdogAction({
    previousSamples: voiceSamples([[1_000, 7]]),
    attemptsThisWindow: 1,
    sample: null,
    mutedAll: false,
  });

  assert.strictEqual(decision.kind, 'clear', 'CR-FIX-10: no usable SFU sample clears the voice-stall latch');
  if (decision.kind === 'clear') assert.strictEqual(decision.deletePeer, true);
}

{
  const decision = decideRemoteVoiceWatchdogAction({
    previousSamples: voiceSamples([[1_000, 7], [2_000, 7], [3_000, 7]]),
    attemptsThisWindow: 2,
    sample: voiceSamples([[4_000, 7]])[0],
    mutedAll: true,
  });

  assert.strictEqual(decision.kind, 'clear', 'CR-FIX-10: muted-all clears the voice-stall latch');
  if (decision.kind === 'clear') {
    assert.strictEqual(decision.deletePeer, false);
    assert.deepStrictEqual(decision.nextSamples, []);
    assert.strictEqual(decision.nextAttemptsThisWindow, 0);
  }
}

{
  const decision = decideRemoteVoiceWatchdogAction({
    previousSamples: voiceSamples([
      [1_000, 7],
      [2_000, 7],
      [3_000, 7],
    ], 'silent'),
    attemptsThisWindow: 1,
    sample: voiceSamples([[4_000, 7]], 'silent')[0],
    mutedAll: false,
  });

  assert.strictEqual(decision.kind, 'clear', 'CR-FIX-10: no voice energy clears the voice-stall latch');
  if (decision.kind === 'clear') assert.strictEqual(decision.deletePeer, false);
}

{
  const decision = decideRemoteVoiceWatchdogAction({
    previousSamples: voiceSamples([
      [1_000, 7],
      [2_000, 7],
      [3_000, 7],
    ]),
    attemptsThisWindow: 4,
    sample: voiceSamples([[4_000, 7]])[0],
    mutedAll: false,
  });

  assert.strictEqual(decision.kind, 'mark-stalled', 'CR-FIX-10: exhausted active stall window keeps the banner latched');
  assert.strictEqual(decision.nextAttemptsThisWindow, 4);
}

{
  const decision = decideRemoteVoiceWatchdogAction({
    previousSamples: [
      { bytes: -1, emitted: 7, audioLevel: 0.02, totalAudioEnergy: 0 },
      { bytes: 2_000, emitted: 7, audioLevel: 0.02, totalAudioEnergy: 0.1 },
      { bytes: 3_000, emitted: 7, audioLevel: 0.02, totalAudioEnergy: 0.2 },
    ],
    attemptsThisWindow: 0,
    sample: { bytes: 4_000, emitted: 7, audioLevel: -0.1, totalAudioEnergy: -1 },
    mutedAll: false,
  });

  assert.strictEqual(decision.kind, 'hold', 'CR-FIX-10: negative stats are rejected and cannot create a false stall verdict');
}

console.log('room-decisions: all assertions passed');
