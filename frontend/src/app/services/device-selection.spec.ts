import assert from 'node:assert/strict';
import {
  isGenericAudioDeviceId,
  resolveSelectedAudioId,
  type ResolveSelectedAudioIdInput,
} from './device-selection.js';

// Fixture device ids (per B2 scenarios.md): MIC1 'default' (generic),
// MIC2 'aaaa1111realhash', MIC3 'bbbb2222realhash'.
const ENUM = ['default', 'aaaa1111realhash', 'bbbb2222realhash'];

// Helper: full input with sane defaults, override per fixture.
function input(over: Partial<ResolveSelectedAudioIdInput>): ResolveSelectedAudioIdInput {
  return {
    chosenId: 'aaaa1111realhash',
    trackReportedId: '',
    enumeratedIds: ENUM,
    storedId: 'aaaa1111realhash',
    ...over,
  };
}

// P1 — chosen present + track reports '' ⇒ keep chosen
{
  const result = resolveSelectedAudioId(
    input({ chosenId: 'aaaa1111realhash', trackReportedId: '', enumeratedIds: ['default', 'aaaa1111realhash', 'bbbb2222realhash'], storedId: 'aaaa1111realhash' }),
  );
  assert.strictEqual(result, 'aaaa1111realhash', "P1: chosen present + track '' ⇒ keep chosen (revert-line regression proof)");
}

// P2 — chosen present + track reports 'default' ⇒ keep chosen
{
  const result = resolveSelectedAudioId(
    input({ chosenId: 'aaaa1111realhash', trackReportedId: 'default', enumeratedIds: ['default', 'aaaa1111realhash', 'bbbb2222realhash'], storedId: 'aaaa1111realhash' }),
  );
  assert.strictEqual(result, 'aaaa1111realhash', "P2: chosen present + track 'default' ⇒ keep chosen (generic does not snap-back)");
}

// P3 — chosen present + track reports DIFFERENT enumerated real id ⇒ adopt track id
{
  const result = resolveSelectedAudioId(
    input({ chosenId: 'aaaa1111realhash', trackReportedId: 'bbbb2222realhash', enumeratedIds: ['default', 'aaaa1111realhash', 'bbbb2222realhash'], storedId: 'aaaa1111realhash' }),
  );
  assert.strictEqual(result, 'bbbb2222realhash', 'P3: chosen present + track DIFFERENT real ⇒ adopt track (honest switch)');
}

// P4 — chosen absent (unplugged) + no stored + track 'default' ⇒ fall back to 'default'
{
  const result = resolveSelectedAudioId(
    input({ chosenId: 'cccc9999goneunplugged', trackReportedId: 'default', enumeratedIds: ['default', 'aaaa1111realhash', 'bbbb2222realhash'], storedId: '' }),
  );
  assert.strictEqual(result, 'default', "P4: chosen gone + no stored + track 'default' ⇒ fall back to 'default' (R2.3 unplug)");
}

// P5 — chosen absent + stored still enumerated ⇒ restore stored
{
  const result = resolveSelectedAudioId(
    input({ chosenId: 'cccc9999goneunplugged', trackReportedId: '', enumeratedIds: ['default', 'aaaa1111realhash', 'bbbb2222realhash'], storedId: 'bbbb2222realhash' }),
  );
  assert.strictEqual(result, 'bbbb2222realhash', 'P5: chosen gone + stored enumerated ⇒ restore stored (R2.2 persistence)');
}

// P6a — nothing usable, devices present ⇒ devices[0]
{
  const result = resolveSelectedAudioId(
    input({ chosenId: 'gone', trackReportedId: 'alsoGone', enumeratedIds: ['aaaa1111realhash', 'bbbb2222realhash'], storedId: 'goneTooStored' }),
  );
  assert.strictEqual(result, 'aaaa1111realhash', "P6a: nothing usable, devices present, no 'default' ⇒ enumeratedIds[0]");
}

// P6b — nothing usable, no devices ⇒ ''
{
  const result = resolveSelectedAudioId(
    input({ chosenId: 'gone', trackReportedId: '', enumeratedIds: [], storedId: '' }),
  );
  assert.strictEqual(result, '', "P6b: nothing usable, no devices ⇒ ''");
}

// P7 — isGenericAudioDeviceId classification
{
  assert.strictEqual(isGenericAudioDeviceId(''), true, "P7: '' is generic");
  assert.strictEqual(isGenericAudioDeviceId('default'), true, "P7: 'default' is generic");
  assert.strictEqual(isGenericAudioDeviceId('communications'), true, "P7: 'communications' is generic");
  assert.strictEqual(isGenericAudioDeviceId('aaaa1111realhash'), false, 'P7: a real device hash is concrete');
}

console.log('device-selection: all assertions passed');
