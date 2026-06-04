import assert from 'node:assert/strict';
import { micOnFromTrack } from './media.service.js';

assert.strictEqual(
  micOnFromTrack({ enabled: true, readyState: 'live' }),
  true,
  'TINY3: enabled live audio track means mic is on',
);
assert.strictEqual(
  micOnFromTrack({ enabled: false, readyState: 'live' }),
  false,
  'TINY3: disabled live audio track means mic is off',
);
assert.strictEqual(
  micOnFromTrack({ enabled: true, readyState: 'ended' }),
  false,
  'TINY3: enabled but ended audio track must not report mic on',
);
assert.strictEqual(
  micOnFromTrack(null),
  false,
  'TINY3: missing audio track means mic is off',
);

console.log('media.service: all assertions passed');
