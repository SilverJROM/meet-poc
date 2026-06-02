import assert from 'node:assert/strict';
import {
  permissionBlockHint,
  resolveMediaToggleAction,
  type MediaToggleAction,
} from './media-toggle.js';

// Collect every action returned across the decision scenarios, to prove the
// union has NO blocked/denied/noop member (step 8 — "never stiff").
const seen: MediaToggleAction[] = [];

// S1.1 — audio, no stream at all ⇒ acquire (mirrors no-localStream case + absent mic)
{
  const result = resolveMediaToggleAction({ streamExists: false, trackExists: false, trackEnabled: false });
  assert.strictEqual(result, 'acquire', 'S1.1: audio no-stream ⇒ acquire');
  seen.push(result);
}

// S1.2 — audio, stream exists but no audio track ⇒ acquire (Bug A: joined mic-off/absent)
{
  const result = resolveMediaToggleAction({ streamExists: true, trackExists: false, trackEnabled: false });
  assert.strictEqual(result, 'acquire', 'S1.2: audio stream-without-track ⇒ acquire');
  seen.push(result);
}

// S1.3 — audio, track exists + disabled ⇒ enable (off-with-track flip on)
{
  const result = resolveMediaToggleAction({ streamExists: true, trackExists: true, trackEnabled: false });
  assert.strictEqual(result, 'enable', 'S1.3: audio track disabled ⇒ enable');
  seen.push(result);
}

// S1.4 — audio, track exists + enabled ⇒ disable (toggle back off)
{
  const result = resolveMediaToggleAction({ streamExists: true, trackExists: true, trackEnabled: true });
  assert.strictEqual(result, 'disable', 'S1.4: audio track enabled ⇒ disable');
  seen.push(result);
}

// S1.5 — video, no stream at all ⇒ acquire (Bug B: no-localStream camera case)
{
  const result = resolveMediaToggleAction({ streamExists: false, trackExists: false, trackEnabled: false });
  assert.strictEqual(result, 'acquire', 'S1.5: video no-stream ⇒ acquire');
  seen.push(result);
}

// S1.6 — video, stream exists but no video track ⇒ acquire (already-working path, decision unchanged)
{
  const result = resolveMediaToggleAction({ streamExists: true, trackExists: false, trackEnabled: false });
  assert.strictEqual(result, 'acquire', 'S1.6: video stream-without-track ⇒ acquire');
  seen.push(result);
}

// S1.7 — video, track exists: disabled ⇒ enable; enabled ⇒ disable (existing flip path preserved)
{
  const enableResult = resolveMediaToggleAction({ streamExists: true, trackExists: true, trackEnabled: false });
  assert.strictEqual(enableResult, 'enable', 'S1.7a: video track disabled ⇒ enable');
  const disableResult = resolveMediaToggleAction({ streamExists: true, trackExists: true, trackEnabled: true });
  assert.strictEqual(disableResult, 'disable', 'S1.7b: video track enabled ⇒ disable');
  seen.push(enableResult, disableResult);
}

// S1 edge — incoherent input (no stream but trackExists true) ⇒ still acquire, never throws
{
  const result = resolveMediaToggleAction({ streamExists: false, trackExists: true, trackEnabled: true });
  assert.strictEqual(result, 'acquire', 'S1 edge: streamExists:false + trackExists:true ⇒ acquire (defensive)');
  seen.push(result);
}

// S1.8 — union of all returned actions ⊆ {acquire,enable,disable}, NO blocked/denied/noop member
{
  const allowed = new Set<MediaToggleAction>(['acquire', 'enable', 'disable']);
  for (const action of seen) {
    assert.ok(allowed.has(action), `S1.8: action '${action}' must be in the allowed set`);
  }
  const forbidden = ['noop', 'blocked', 'denied'];
  for (const bad of forbidden) {
    assert.ok(!seen.includes(bad as MediaToggleAction), `S1.8: '${bad}' action must never be returned (never-stiff)`);
  }
}

// S2.1 — audio NotAllowedError ⇒ hint names microphone + address bar / site settings
{
  const hint = permissionBlockHint('audio', { name: 'NotAllowedError' });
  assert.ok(typeof hint === 'string' && hint.length > 0, 'S2.1: audio NotAllowedError ⇒ non-empty string');
  assert.ok(/microphone/i.test(hint as string), 'S2.1: audio hint names microphone');
  assert.ok(/address bar|site settings/i.test(hint as string), 'S2.1: audio hint references address bar / site settings');
}

// S2.2 — video NotAllowedError ⇒ hint names camera
{
  const hint = permissionBlockHint('video', { name: 'NotAllowedError' });
  assert.ok(typeof hint === 'string' && hint.length > 0, 'S2.2: video NotAllowedError ⇒ non-empty string');
  assert.ok(/camera/i.test(hint as string), 'S2.2: video hint names camera');
}

// S2.3 — audio NotFoundError ⇒ null (defers to generic path)
{
  const hint = permissionBlockHint('audio', { name: 'NotFoundError' });
  assert.strictEqual(hint, null, 'S2.3: NotFoundError ⇒ null');
}

// S2.4 — generic Error ⇒ null
{
  const hint = permissionBlockHint('video', new Error('boom'));
  assert.strictEqual(hint, null, 'S2.4: generic Error ⇒ null');
}

// S2.5 — hint for both kinds NEVER implies permanence/dead-end
{
  const audioHint = permissionBlockHint('audio', { name: 'NotAllowedError' }) as string;
  const videoHint = permissionBlockHint('video', { name: 'NotAllowedError' }) as string;
  assert.ok(!/disabled|forever/i.test(audioHint), 'S2.5: audio hint must not match /disabled|forever/i');
  assert.ok(!/disabled|forever/i.test(videoHint), 'S2.5: video hint must not match /disabled|forever/i');
}

// S2 edge — Chrome legacy PermissionDeniedError alias ⇒ treated as NotAllowedError (returns hint)
{
  const hint = permissionBlockHint('audio', { name: 'PermissionDeniedError' });
  assert.ok(typeof hint === 'string' && /microphone/i.test(hint as string), 'S2 edge: PermissionDeniedError alias ⇒ hint');
}

// S2 edge — null / undefined err ⇒ null, never throws
{
  assert.strictEqual(permissionBlockHint('audio', null), null, 'S2 edge: null err ⇒ null');
  assert.strictEqual(permissionBlockHint('video', undefined), null, 'S2 edge: undefined err ⇒ null');
}

console.log('media-toggle: all assertions passed');
