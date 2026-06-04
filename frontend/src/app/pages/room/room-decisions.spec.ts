import assert from 'node:assert/strict';
import {
  shouldAcquireMicTrackForToggle,
  shouldClearVideoPinAfterRefresh,
  shouldPromptGuestPassword,
  shouldSubmitChat,
  storedDeviceAfterSelectionAttempt,
} from './room-decisions';

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

console.log('room-decisions: all assertions passed');
