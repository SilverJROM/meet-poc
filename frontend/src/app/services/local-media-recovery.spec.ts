import assert from 'node:assert/strict';
import {
  classifyLocalAudioRecoveryError,
  localAudioRecoveryTerminalMessage,
} from './local-media-recovery.js';

const CONNECT_MIC_MESSAGE = 'No microphone available. Connect a microphone, then choose it from devices.';

// R9-S1 — permission revoked mid-call points to site settings + rejoin, not absent hardware.
{
  const message = localAudioRecoveryTerminalMessage({ name: 'NotAllowedError' });
  assert.strictEqual(classifyLocalAudioRecoveryError({ name: 'NotAllowedError' }), 'permission-denied');
  assert.match(message, /re-grant mic permission in site settings, then rejoin/i);
  assert.doesNotMatch(message, /connect a microphone/i);
}

// R9-S1 edge — Chrome legacy PermissionDeniedError follows the same permission copy.
{
  const message = localAudioRecoveryTerminalMessage({ name: 'PermissionDeniedError' });
  assert.strictEqual(classifyLocalAudioRecoveryError({ name: 'PermissionDeniedError' }), 'permission-denied');
  assert.match(message, /re-grant mic permission in site settings, then rejoin/i);
}

// R9-S2 — OS/browser capture busy errors tell the user to close the other app and retry.
{
  const notReadable = localAudioRecoveryTerminalMessage({ name: 'NotReadableError' });
  const trackStart = localAudioRecoveryTerminalMessage({ name: 'TrackStartError' });
  assert.strictEqual(classifyLocalAudioRecoveryError({ name: 'NotReadableError' }), 'in-use');
  assert.strictEqual(classifyLocalAudioRecoveryError({ name: 'TrackStartError' }), 'in-use');
  assert.match(notReadable, /close the other app using your mic, then click the mic button/i);
  assert.match(trackStart, /close the other app using your mic, then click the mic button/i);
  assert.doesNotMatch(notReadable, /connect a microphone/i);
}

// R9 no-regression — true no-mic / NotFound keeps the existing connect-a-microphone copy unchanged.
{
  assert.strictEqual(classifyLocalAudioRecoveryError({ name: 'NotFoundError' }), 'no-mic');
  assert.strictEqual(localAudioRecoveryTerminalMessage({ name: 'NotFoundError' }), CONNECT_MIC_MESSAGE);
  assert.strictEqual(localAudioRecoveryTerminalMessage({ code: 'no-devices' }), CONNECT_MIC_MESSAGE);
}

// R9 default — unknown terminal failures still give a clear recovery path.
{
  const message = localAudioRecoveryTerminalMessage(new Error('unexpected driver state'));
  assert.strictEqual(classifyLocalAudioRecoveryError(new Error('unexpected driver state')), 'unknown');
  assert.match(message, /check your microphone, permissions, and other apps/i);
  assert.match(message, /click the mic button/i);
}

console.log('local-media-recovery: all assertions passed');
