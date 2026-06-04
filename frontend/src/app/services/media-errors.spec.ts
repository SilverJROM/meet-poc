import assert from 'node:assert/strict';
import { normalizeMediaError } from './media-errors.js';

// ERR5 — exhausted exact→ideal→default audio ladder OverconstrainedError gets clear typed copy.
{
  const normalized = normalizeMediaError({
    name: 'OverconstrainedError',
    message: 'Requested device could not satisfy constraint: deviceId',
  });
  assert.strictEqual(normalized.code, 'no-devices');
  assert.strictEqual(normalized.message, 'No devices found');
  assert.doesNotMatch(normalized.message, /constraint|deviceId|could not satisfy/i);
}

// Existing permission and in-use classifications are preserved after extraction.
{
  assert.deepStrictEqual(normalizeMediaError({ name: 'NotAllowedError' }), {
    code: 'denied',
    message: 'Media permission denied',
  });
  assert.deepStrictEqual(normalizeMediaError({ name: 'TrackStartError' }), {
    code: 'in-use',
    message: 'Camera or microphone is in use by another app or tab',
  });
}

console.log('media-errors: all assertions passed');
