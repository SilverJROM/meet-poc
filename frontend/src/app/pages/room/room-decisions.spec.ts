import assert from 'node:assert/strict';
import type { VoiceRecoverySample } from '../../services/remote-audio.service';
import {
  classifyPeerAudioHealth,
  decideLocalTrackFailureRecovery,
  decideRemoteVoiceWatchdogAction,
  derivePublishGateStatus,
  fallbackChosenIdForAudioSync,
  missingPreflightPrereqs,
  nextMicWorkingState,
  requireLiveTransceiver,
  shouldOpenDeviceDialogOnAudioFail,
  shouldShowAudioFailNotice,
  shouldSurfacePublishFailure,
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
    publisherMicEnabled: false,
  });

  assert.strictEqual(decision.kind, 'clear', 'R3a: mic-off bytes-flat is healthy silence, clears the voice-stall latch');
  if (decision.kind === 'clear') {
    assert.strictEqual(decision.deletePeer, false);
    assert.deepStrictEqual(decision.nextSamples, [sample]);
    assert.strictEqual(decision.nextAttemptsThisWindow, 0);
  }
}

// R3b: bytes-flat (no inbound RTP at all) with mic on/unknown is NOT healthy silence — it's a
// subscribed-no-RTP failure that must escalate into the SFU recovery coordinator, never a silent clear.
{
  const previousSamples = voiceSamples([
    [5_000, 7],
    [5_000, 7],
    [5_000, 7],
  ]);
  const sample = voiceSamples([[5_000, 7]])[0];
  const decisionMicOn = decideRemoteVoiceWatchdogAction({
    previousSamples,
    attemptsThisWindow: 3,
    sample,
    mutedAll: false,
    publisherMicEnabled: true,
  });

  assert.strictEqual(decisionMicOn.kind, 'escalate-recovery', 'R3b: mic-on bytes-flat escalates to SFU recovery, not clear');
  assert.deepStrictEqual(decisionMicOn.nextSamples, [sample]);
  assert.strictEqual(decisionMicOn.nextAttemptsThisWindow, 0);

  const decisionMicUnknown = decideRemoteVoiceWatchdogAction({
    previousSamples,
    attemptsThisWindow: 3,
    sample,
    mutedAll: false,
  });

  assert.strictEqual(decisionMicUnknown.kind, 'escalate-recovery', 'R3b: mic-unknown bytes-flat escalates to SFU recovery, not clear');
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

  assert.strictEqual(decision.kind, 'recover', 'PHASE-D: bytes-climbing/emitted-flat zero-energy window still recovers');
  if (decision.kind === 'recover') {
    assert.strictEqual(decision.recoveryAction, 'kickstart');
    assert.strictEqual(decision.nextAttemptsThisWindow, 2);
  }
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

  assert.strictEqual(decision.kind, 'escalate-recovery', 'R3b: exhausted playout recovery window escalates instead of latching mark-stalled');
  assert.strictEqual(decision.nextAttemptsThisWindow, 4);
}

// R3: replaces BUG-REPRO-R1-mark-stalled-give-up — the playout-recovery cap must escalate into the SFU
// recovery coordinator on every subsequent poll, never latch a silent terminal give-up.
{
  const stalledFixture = voiceSamples([
    [1_000, 7],
    [2_000, 7],
    [3_000, 7],
    [4_000, 7],
  ]);
  const escalated = decideRemoteVoiceWatchdogAction({
    previousSamples: stalledFixture.slice(0, 3),
    attemptsThisWindow: 4,
    sample: stalledFixture[3],
    mutedAll: false,
  });

  assert.strictEqual(escalated.kind, 'escalate-recovery', 'R3-NEVER-GIVE-UP: attempt cap escalates instead of latching mark-stalled');
  assert.strictEqual(escalated.nextAttemptsThisWindow, 4);

  for (let poll = 0; poll < 3; poll += 1) {
    const decision = decideRemoteVoiceWatchdogAction({
      previousSamples: escalated.nextSamples,
      attemptsThisWindow: escalated.nextAttemptsThisWindow,
      sample: stalledFixture[3],
      mutedAll: false,
    });
    assert.strictEqual(decision.kind, 'escalate-recovery', `R3-NEVER-GIVE-UP: poll ${poll + 1} keeps escalating, never gives up silently`);
    assert.strictEqual(decision.nextAttemptsThisWindow, 4, `R3-NEVER-GIVE-UP: attempts remain capped on poll ${poll + 1}`);
  }
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

// ── R8: fallbackChosenIdForAudioSync ─────────────────────────────────────────
// The bug: when the capture track reports a generic id ('default') on a non-exact
// acquisition the old code returned '' → resolveSelectedAudioId skipped rule 2 and
// snapped back to the previous stored device.  Fix: return requestedDeviceId.
assert.strictEqual(
  fallbackChosenIdForAudioSync({ requestedDeviceId: 'device-B', trackReportedId: 'default', stage: 'default' }),
  'device-B',
  'R8: generic track id preserves requestedDeviceId instead of returning empty',
);
assert.strictEqual(
  fallbackChosenIdForAudioSync({ requestedDeviceId: 'device-B', trackReportedId: 'device-C', stage: 'default' }),
  'device-C',
  'R8: non-generic reported id takes precedence (device switched at OS level)',
);
assert.strictEqual(
  fallbackChosenIdForAudioSync({ requestedDeviceId: 'device-B', trackReportedId: 'device-B', stage: 'exact' }),
  'device-B',
  'R8: exact acquisition path returns requestedDeviceId unchanged',
);
assert.strictEqual(
  fallbackChosenIdForAudioSync({ requestedDeviceId: 'device-B', trackReportedId: '', stage: 'default' }),
  'device-B',
  'R8: empty track reported id (getSettings had no deviceId) preserves requestedDeviceId',
);

// ── Publish gate: all never-publish paths reach audio-failed ──────────────────
assert.strictEqual(
  derivePublishGateStatus({ triggerFired: false, publishFailed: false, stateReverted: false, noLiveAudioAtDeadline: false }),
  'audio-failed',
  'PATH A: publish trigger never fired → audio-failed (publishTriggerCount=0)',
);
assert.strictEqual(
  derivePublishGateStatus({ triggerFired: true, publishFailed: true, stateReverted: false, noLiveAudioAtDeadline: false }),
  'audio-failed',
  'PATH B/C: retries exhausted → audio-failed',
);
assert.strictEqual(
  derivePublishGateStatus({ triggerFired: true, publishFailed: false, stateReverted: false, noLiveAudioAtDeadline: true }),
  'audio-failed',
  'haiku path: no live audio track at deadline (empty transceiver) → audio-failed',
);
assert.strictEqual(
  derivePublishGateStatus({ triggerFired: true, publishFailed: false, stateReverted: true, noLiveAudioAtDeadline: false }),
  'audio-failed',
  'state-revert: in-call→waiting-room during publish → audio-failed',
);
assert.strictEqual(
  derivePublishGateStatus({ triggerFired: true, publishFailed: false, stateReverted: false, noLiveAudioAtDeadline: false }),
  'audio-connecting',
  'happy path: trigger fired, no failure → audio-connecting (still in flight)',
);

// ── Preflight prereqs gate: mic access is the hard join prerequisite ─────────
assert.deepStrictEqual(
  missingPreflightPrereqs({ hasMicAccess: false, micVerified: false, speakerTested: false }),
  ['mic'],
  'R9: no mic access → mic blocked; speaker state is not double-counted',
);
assert.deepStrictEqual(
  missingPreflightPrereqs({ hasMicAccess: true, micVerified: false, speakerTested: false }),
  [],
  'R9: silent/dead mic with access can join; in-call watchdog surfaces it',
);
assert.deepStrictEqual(
  missingPreflightPrereqs({ hasMicAccess: true, micVerified: true, speakerTested: false }),
  [],
  'R9: speaker test is visible preflight guidance, not a join blocker',
);
assert.deepStrictEqual(
  missingPreflightPrereqs({ hasMicAccess: true, micVerified: true, speakerTested: true }),
  [],
  'R1: mic+speaker verified → gate clears (camera off NOT blocking)',
);

// ── shouldSurfacePublishFailure: finally-block guard (CR-FIX-1) ───────────────
assert.strictEqual(
  shouldSurfacePublishFailure({ publishSucceeded: false, gateStatus: 'audio-connecting' }),
  true,
  'CR-FIX-1: state-revert exit with gate still audio-connecting → must surface audio-failed',
);
assert.strictEqual(
  shouldSurfacePublishFailure({ publishSucceeded: true, gateStatus: 'ready' }),
  false,
  'CR-FIX-1: happy path (publishSucceeded=true) → finally guard does not fire',
);
assert.strictEqual(
  shouldSurfacePublishFailure({ publishSucceeded: false, gateStatus: 'audio-failed' }),
  false,
  'CR-FIX-1: inner loop already set audio-failed → guard skips double-set',
);

// ── nextMicWorkingState (CR-FIX-2): positive "mic confirmed energy" reducer ───
assert.strictEqual(
  nextMicWorkingState(false, 'working', true),
  true,
  'CR-FIX-2 mic: working classification → micWorking becomes true',
);
assert.strictEqual(
  nextMicWorkingState(true, 'silent', true),
  false,
  'CR-FIX-2 mic: silent classification → micWorking becomes false',
);
assert.strictEqual(
  nextMicWorkingState(true, 'indeterminate', true),
  true,
  'CR-FIX-2 mic: indeterminate after working → stays true (no flicker)',
);
assert.strictEqual(
  nextMicWorkingState(false, 'indeterminate', true),
  false,
  'CR-FIX-2 mic: indeterminate while untested → stays false (no false pass)',
);
assert.strictEqual(
  nextMicWorkingState(true, 'working', false),
  false,
  'CR-FIX-2 mic: mic disabled (micActive=false) → false regardless of cls',
);
assert.strictEqual(
  nextMicWorkingState(false, 'working', false),
  false,
  'CR-FIX-2 mic: mic off + working cls → false (mic off = unverified)',
);

// ── Speaker confirm state: explicit Yes records speakerVerified without hard-blocking join ──
assert.deepStrictEqual(
  missingPreflightPrereqs({ hasMicAccess: true, micVerified: true, speakerTested: false }),
  [],
  'R9: tone not confirmed does not block the access-only join gate',
);
assert.deepStrictEqual(
  missingPreflightPrereqs({ hasMicAccess: true, micVerified: true, speakerTested: true }),
  [],
  'CR-FIX-2 speaker: user confirmed they heard it (speakerVerified=true) → gate clears',
);

// ── R9: quiet-guest policy — shouldOpenDeviceDialogOnAudioFail + shouldShowAudioFailNotice ──
assert.strictEqual(
  shouldOpenDeviceDialogOnAudioFail({ isHost: true }),
  true,
  'R9: host gets device dialog on audio failure',
);
assert.strictEqual(
  shouldOpenDeviceDialogOnAudioFail({ isHost: false }),
  false,
  'R9: guest does NOT auto-open device dialog on audio failure (quiet guest)',
);
assert.strictEqual(
  shouldShowAudioFailNotice({ isHost: true }),
  true,
  'R9: host sees failure notice (retry/rejoin text)',
);
assert.strictEqual(
  shouldShowAudioFailNotice({ isHost: false }),
  false,
  'R9: guest does NOT see technical failure notice (silent background retry)',
);

// ── R10: failure-simulation matrix ────────────────────────────────────────────

// R10(a) — audio-not-reaching-server: inbound bytes stuck at 0 → stalled badge
assert.strictEqual(
  classifyPeerAudioHealth({ isPublishing: true, hasTrack: true, bytesReceivedNow: 0, bytesReceivedPrev: 0, micEnabled: true, pastGrace: true }),
  'stalled',
  'R10(a): inbound bytes frozen at 0 (audio not reaching host) → stalled → host badge',
);
assert.strictEqual(
  classifyPeerAudioHealth({ isPublishing: true, hasTrack: true, bytesReceivedNow: 1000, bytesReceivedPrev: 500, micEnabled: true, pastGrace: true }),
  'ok',
  'R10(a): climbing bytes → ok (audio flowing normally)',
);
assert.strictEqual(
  classifyPeerAudioHealth({ isPublishing: true, hasTrack: false, bytesReceivedNow: null, bytesReceivedPrev: null, micEnabled: true, pastGrace: true }),
  'no-track',
  'R10(a): publishing peer with no inbound track → no-track → host badge',
);
assert.strictEqual(
  classifyPeerAudioHealth({ isPublishing: false, hasTrack: false, bytesReceivedNow: null, bytesReceivedPrev: null, micEnabled: true, pastGrace: false }),
  'ok',
  'R10(a): peer within grace window (not yet joined SFU) → ok (no flicker)',
);
assert.strictEqual(
  classifyPeerAudioHealth({ isPublishing: true, hasTrack: true, bytesReceivedNow: 500, bytesReceivedPrev: null, micEnabled: true, pastGrace: true }),
  'ok',
  'R10(a): first sample (no prev) → ok (never false-positive on first tick)',
);
assert.strictEqual(
  classifyPeerAudioHealth({ isPublishing: true, hasTrack: true, bytesReceivedNow: 500, bytesReceivedPrev: 600, micEnabled: true, pastGrace: true }),
  'stalled',
  'R10(a): bytes decreased (jitter/reset) → stalled (not climbing)',
);
// CR-FIX-4: mute-awareness, grace period, roster-coverage
assert.strictEqual(
  classifyPeerAudioHealth({ isPublishing: true, hasTrack: true, bytesReceivedNow: 0, bytesReceivedPrev: 0, micEnabled: false, pastGrace: true }),
  'ok',
  'CR-FIX-4: muted peer with stalled bytes → ok (mute takes priority, no cry-wolf)',
);
assert.strictEqual(
  classifyPeerAudioHealth({ isPublishing: false, hasTrack: false, bytesReceivedNow: null, bytesReceivedPrev: null, micEnabled: true, pastGrace: false }),
  'ok',
  'CR-FIX-4: just-joined peer within grace → ok (subscription setup window, no flicker)',
);
assert.strictEqual(
  classifyPeerAudioHealth({ isPublishing: false, hasTrack: false, bytesReceivedNow: null, bytesReceivedPrev: null, micEnabled: true, pastGrace: true }),
  'never-published',
  'CR-FIX-4: admitted + past grace + never published + unmuted → never-published → host badge (Joanne case)',
);
assert.strictEqual(
  classifyPeerAudioHealth({ isPublishing: false, hasTrack: false, bytesReceivedNow: null, bytesReceivedPrev: null, micEnabled: false, pastGrace: true }),
  'ok',
  'CR-FIX-4: admitted + past grace + never published + muted → ok (mute beats never-published)',
);
assert.strictEqual(
  classifyPeerAudioHealth({ isPublishing: true, hasTrack: true, bytesReceivedNow: 0, bytesReceivedPrev: 0, micEnabled: true, pastGrace: true }),
  'stalled',
  'CR-FIX-4: publishing + stalled + unmuted + past grace → stalled → host badge',
);

// R10(b) — publish-fails → audio-failed (handled, not silent)
assert.strictEqual(
  derivePublishGateStatus({ triggerFired: true, publishFailed: true, stateReverted: false, noLiveAudioAtDeadline: false }),
  'audio-failed',
  'R10(b): publish-fails → audio-failed (surfaced via gate status, not silent)',
);

// R10(c) — hasPc=false trigger-never-fires → audio-failed
assert.strictEqual(
  derivePublishGateStatus({ triggerFired: false, publishFailed: false, stateReverted: false, noLiveAudioAtDeadline: false }),
  'audio-failed',
  'R10(c): hasPc=false / trigger never fired → audio-failed (PATH A handled)',
);

// R10(d) — state-revert-mid-publish → audio-failed (shouldSurfacePublishFailure guard)
assert.strictEqual(
  shouldSurfacePublishFailure({ publishSucceeded: false, gateStatus: 'audio-connecting' }),
  true,
  'R10(d): state-revert mid-publish leaves gate at audio-connecting → finally guard fires → audio-failed',
);
assert.strictEqual(
  derivePublishGateStatus({ triggerFired: true, publishFailed: false, stateReverted: true, noLiveAudioAtDeadline: false }),
  'audio-failed',
  'R10(d): stateReverted=true → audio-failed via derivePublishGateStatus',
);

// R10(e) — mic-dies-mid-call (track ended) → recovery attempted
assert.strictEqual(
  decideLocalTrackFailureRecovery({ inCall: true, currentTrack: true, trackEnabled: true, event: 'ended', trackReadyState: 'ended' }),
  'recover-ended',
  'R10(e): in-call mic track ends unexpectedly → recover-ended (not ignored)',
);

// R10(f) — speaker-dead (not verified) → gate blocks join
assert.deepStrictEqual(
  missingPreflightPrereqs({ hasMicAccess: true, micVerified: true, speakerTested: false }),
  [],
  'R10(f)/R9: speaker not tested does not block access-only join gate',
);

// R10(g) — device-unplugged at gate → config panel / re-acquire (mic missing)
assert.deepStrictEqual(
  missingPreflightPrereqs({ hasMicAccess: false, micVerified: false, speakerTested: true }),
  ['mic'],
  'R10(g): mic permission/device lost at gate → gate blocks with [mic]',
);

// R10(h) — permission-revoked → friendly green-room block
assert.deepStrictEqual(
  missingPreflightPrereqs({ hasMicAccess: false, micVerified: false, speakerTested: false }),
  ['mic'],
  'R10(h)/R9: permission revoked → gate blocks on mic access',
);

// R10(i) — empty-transceiver → throws loudly (not silently swallowed)
assert.throws(
  () => requireLiveTransceiver(null),
  /no live audio transceiver/,
  'R10(i): null transceiver throws loudly — empty-transceiver path is never silent',
);
assert.throws(
  () => requireLiveTransceiver(undefined),
  /no live audio transceiver/,
  'R10(i): undefined transceiver throws loudly',
);
{
  const obj = { sender: {} };
  assert.strictEqual(
    requireLiveTransceiver(obj),
    obj,
    'R10(i): live transceiver passes through unchanged',
  );
}

console.log('room-decisions: all assertions passed');
