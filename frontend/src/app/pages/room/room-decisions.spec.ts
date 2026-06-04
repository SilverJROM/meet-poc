import assert from 'node:assert/strict';
import { shouldPromptGuestPassword, shouldSubmitChat } from './room-decisions';

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

console.log('room-decisions: all assertions passed');
