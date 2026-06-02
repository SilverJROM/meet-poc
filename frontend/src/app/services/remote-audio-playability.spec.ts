import assert from 'node:assert/strict';
import {
  evaluateRemoteAudioPlayability,
  type RemoteAudioPlayabilityInput,
} from './remote-audio-playability.js';

// Helper: full input with sane defaults, override per fixture.
function input(over: Partial<RemoteAudioPlayabilityInput>): RemoteAudioPlayabilityInput {
  return {
    mixerEnabled: true,
    contextState: 'running',
    sourcesCount: 1,
    outputAttached: true,
    outputPaused: false,
    perPeerAllUnpaused: true,
    ...over,
  };
}

// U1 — suspended context + sources ⇒ NOT playable (banner condition true)
{
  const result = evaluateRemoteAudioPlayability(
    input({ contextState: 'suspended', sourcesCount: 1, outputPaused: false, perPeerAllUnpaused: true }),
  );
  assert.strictEqual(result, false, 'U1: suspended + sources ⇒ not playable (BUG-1 regression proof)');
}

// U2 — running + sources + all unpaused ⇒ playable
{
  const result = evaluateRemoteAudioPlayability(
    input({ contextState: 'running', sourcesCount: 1, outputPaused: false, perPeerAllUnpaused: true }),
  );
  assert.strictEqual(result, true, 'U2: running + sources + unpaused ⇒ playable');
}

// U3 — running but output paused ⇒ NOT playable
{
  const result = evaluateRemoteAudioPlayability(
    input({ contextState: 'running', sourcesCount: 1, outputPaused: true }),
  );
  assert.strictEqual(result, false, 'U3: running but outputPaused ⇒ not playable');
}

// U4 — running but output not attached ⇒ NOT playable
{
  const result = evaluateRemoteAudioPlayability(
    input({ contextState: 'running', sourcesCount: 1, outputAttached: false }),
  );
  assert.strictEqual(result, false, 'U4: running but !outputAttached ⇒ not playable');
}

// U5 — running + ZERO sources ⇒ per-peer fallback (true)
{
  const result = evaluateRemoteAudioPlayability(
    input({ contextState: 'running', sourcesCount: 0, perPeerAllUnpaused: true }),
  );
  assert.strictEqual(result, true, 'U5: running + 0 sources ⇒ per-peer fallback true');
}

// U6 — ZERO sources but a per-peer element paused ⇒ fallback false
{
  const result = evaluateRemoteAudioPlayability(
    input({ contextState: 'suspended', sourcesCount: 0, outputPaused: true, perPeerAllUnpaused: false }),
  );
  assert.strictEqual(result, false, 'U6: 0 sources ignores context/output, returns exactly perPeerAllUnpaused (false)');
}

// U7 — closed context + sources ⇒ NOT playable
{
  const result = evaluateRemoteAudioPlayability(
    input({ contextState: 'closed', sourcesCount: 1 }),
  );
  assert.strictEqual(result, false, 'U7: closed + sources ⇒ not playable (closed !== running)');
}

// U8 — 'none' context + sources ⇒ NOT playable
{
  const result = evaluateRemoteAudioPlayability(
    input({ contextState: 'none', sourcesCount: 1 }),
  );
  assert.strictEqual(result, false, "U8: 'none' + sources ⇒ not playable (pre-graph snapshot value)");
}

// U9 — mixer disabled + sources ⇒ per-peer fallback (true)
{
  const result = evaluateRemoteAudioPlayability(
    input({ mixerEnabled: false, contextState: 'suspended', sourcesCount: 2, outputAttached: false, outputPaused: true, perPeerAllUnpaused: true }),
  );
  assert.strictEqual(result, true, 'U9: mixer disabled ⇒ ignores context/output, returns perPeerAllUnpaused (true)');
}

// U10 — mixer disabled + a per-peer element paused ⇒ fallback false
{
  const result = evaluateRemoteAudioPlayability(
    input({ mixerEnabled: false, contextState: 'running', sourcesCount: 0, outputAttached: true, outputPaused: false, perPeerAllUnpaused: false }),
  );
  assert.strictEqual(result, false, 'U10: mixer disabled ⇒ returns exactly perPeerAllUnpaused (false)');
}

console.log('remote-audio-playability: all assertions passed');
