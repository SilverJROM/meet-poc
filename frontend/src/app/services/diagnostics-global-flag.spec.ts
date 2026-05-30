import assert from 'node:assert/strict';

// B-1 — effective diagnostics gate truth table. Exercises the REAL exported
// helper from diagnostics-prefs.ts: diagnostics collect+upload only when BOTH
// the per-device user toggle AND the global (admin) kill-switch are ON.
const { computeEffectiveDiagnosticsEnabled } = await import('./diagnostics-prefs.js');

// (userEnabled, globalEnabled) -> effective
assert.strictEqual(computeEffectiveDiagnosticsEnabled(true, true), true, '(ON, ON) -> collect');
assert.strictEqual(computeEffectiveDiagnosticsEnabled(true, false), false, '(ON, OFF) -> stop');
assert.strictEqual(computeEffectiveDiagnosticsEnabled(false, true), false, '(OFF, ON) -> stop');
assert.strictEqual(computeEffectiveDiagnosticsEnabled(false, false), false, '(OFF, OFF) -> stop');

console.log('diagnostics-global-flag: all assertions passed');
