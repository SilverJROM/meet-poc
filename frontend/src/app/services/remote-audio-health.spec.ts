import assert from 'node:assert/strict';
import {
  classifyRemoteAudioHealth,
  concealmentRatio,
  remoteAudioBadgeLabel,
  SILENT_REMOTE_CONCEALMENT_RATIO,
  SILENT_REMOTE_MIN_EMITTED_SAMPLES,
  type RemoteAudioInboundStats,
} from './remote-audio-health.js';

// Helper: build a track with audio defaults, override per fixture.
function track(over: Partial<RemoteAudioInboundStats>): RemoteAudioInboundStats {
  return {
    kind: 'audio',
    bytesReceived: null,
    packetsReceived: null,
    jitterBufferEmittedCount: null,
    concealedSamples: null,
    ...over,
  };
}

// RAH-1 — silent: high concealment ratio (0.7) classifies 'silent'
{
  const result = classifyRemoteAudioHealth(
    track({ concealedSamples: 70000, jitterBufferEmittedCount: 30000 }),
  );
  assert.strictEqual(result, 'silent', 'RAH-1: ratio 0.7, total 100000 ⇒ silent');
  assert.strictEqual(
    concealmentRatio(track({ concealedSamples: 70000, jitterBufferEmittedCount: 30000 })),
    0.7,
    'RAH-1: concealmentRatio = 0.7',
  );
}

// RAH-2 — ok: low concealment ratio (0.02) classifies 'ok'
{
  const result = classifyRemoteAudioHealth(
    track({ concealedSamples: 2000, jitterBufferEmittedCount: 98000 }),
  );
  assert.strictEqual(result, 'ok', 'RAH-2: ratio 0.02, total 100000 ⇒ ok');
}

// RAH-3 — unknown (null operand): either input null ⇒ 'unknown', no throw
{
  const fixtures: Array<Partial<RemoteAudioInboundStats>> = [
    { concealedSamples: null, jitterBufferEmittedCount: 30000 },
    { concealedSamples: 70000, jitterBufferEmittedCount: null },
    { concealedSamples: null, jitterBufferEmittedCount: null },
  ];
  for (const f of fixtures) {
    assert.doesNotThrow(() => classifyRemoteAudioHealth(track(f)), 'RAH-3: null must not throw');
    assert.strictEqual(classifyRemoteAudioHealth(track(f)), 'unknown', 'RAH-3: null operand ⇒ unknown');
  }
}

// RAH-4 — unknown (div-by-zero guard): both 0 ⇒ 'unknown', no NaN, no throw
{
  const f = track({ concealedSamples: 0, jitterBufferEmittedCount: 0 });
  assert.doesNotThrow(() => classifyRemoteAudioHealth(f), 'RAH-4: 0+0 must not throw');
  const result = classifyRemoteAudioHealth(f);
  assert.strictEqual(result, 'unknown', 'RAH-4: 0+0 ⇒ unknown (floor catches div0)');
  assert.notStrictEqual(result, 'silent', 'RAH-4: 0+0 must NOT yield silent (no NaN>=0.5)');
  // concealmentRatio guards the denominator independently.
  assert.strictEqual(concealmentRatio(f), null, 'RAH-4: ratio is null when denominator 0');
}

// RAH-5 — unknown (below floor): early/short sample ⇒ 'unknown', NOT 'silent' [JROM invariant]
{
  // High ratio (0.9) but total 10000 < 48000 floor.
  const high = classifyRemoteAudioHealth(
    track({ concealedSamples: 9000, jitterBufferEmittedCount: 1000 }),
  );
  assert.strictEqual(high, 'unknown', 'RAH-5: high-ratio below floor ⇒ unknown');
  assert.notStrictEqual(high, 'silent', 'RAH-5: short high-concealment sample must NOT false-flag silent');
  // Low ratio but also below floor ⇒ unknown (not yet trustworthy).
  const low = classifyRemoteAudioHealth(
    track({ concealedSamples: 100, jitterBufferEmittedCount: 1000 }),
  );
  assert.strictEqual(low, 'unknown', 'RAH-5: low-ratio below floor ⇒ unknown (not ok)');
}

// RAH-6 — unknown (kind): non-audio track ⇒ 'unknown' even with silent-grade ratio
{
  const result = classifyRemoteAudioHealth(
    track({ kind: 'video', concealedSamples: 70000, jitterBufferEmittedCount: 30000 }),
  );
  assert.strictEqual(result, 'unknown', 'RAH-6: kind=video ⇒ unknown (kind guard precedes ratio)');
  assert.notStrictEqual(result, 'silent', 'RAH-6: silent-grade numbers must not leak through video');
}

// RAH-7 — hardener: silent + sourceMicSilent===true ⇒ 'silent' AND "silent at source" label [D2]
{
  const silentFixture = track({ concealedSamples: 70000, jitterBufferEmittedCount: 30000 });
  const verdict = classifyRemoteAudioHealth(silentFixture, true);
  assert.strictEqual(verdict, 'silent', 'RAH-7: verdict stays silent (hardener does not change it)');
  const label = remoteAudioBadgeLabel(verdict, true);
  assert.ok(
    label.includes('silent at source'),
    'RAH-7: corroborated label contains "silent at source"',
  );
  assert.strictEqual(label, 'SILENT REMOTE · silent at source', 'RAH-7: exact corroborated label');
}

// RAH-8 — hardener no-flip: ok + sourceMicSilent===true STAYS 'ok' [D2 invariant]
{
  const okFixture = track({ concealedSamples: 2000, jitterBufferEmittedCount: 98000 });
  const verdict = classifyRemoteAudioHealth(okFixture, true);
  assert.strictEqual(verdict, 'ok', 'RAH-8: ok stays ok with sourceMicSilent=true');
  assert.notStrictEqual(verdict, 'silent', 'RAH-8: sourceMicSilent must NOT manufacture a silent verdict');
  const label = remoteAudioBadgeLabel(verdict, true);
  assert.ok(!label.includes('silent at source'), 'RAH-8: ok verdict label has no "silent at source"');
  assert.strictEqual(label, '', 'RAH-8: ok verdict ⇒ no badge label');
}

// RAH-9 — boundary: ratio exactly at the 0.5 threshold ⇒ 'silent' (>= inclusive) + constants
{
  const atBoundary = classifyRemoteAudioHealth(
    track({ concealedSamples: 50000, jitterBufferEmittedCount: 50000 }),
  );
  assert.strictEqual(atBoundary, 'silent', 'RAH-9: ratio exactly 0.5 ⇒ silent (inclusive >=)');
  const justUnder = classifyRemoteAudioHealth(
    track({ concealedSamples: 49999, jitterBufferEmittedCount: 50001 }),
  );
  assert.strictEqual(justUnder, 'ok', 'RAH-9: ratio just under 0.5 ⇒ ok');
  // Constant sanity (mirrors mic-energy.spec.ts threshold sanity).
  assert.strictEqual(SILENT_REMOTE_CONCEALMENT_RATIO, 0.5, 'RAH-9: ratio constant is 0.5');
  assert.strictEqual(SILENT_REMOTE_MIN_EMITTED_SAMPLES, 48000, 'RAH-9: floor constant is 48000');
}

// RAH-12 (mapper helper) — badge label only emits for 'silent', empty for ok/unknown
{
  assert.strictEqual(remoteAudioBadgeLabel('silent'), 'SILENT REMOTE', 'RAH-12: silent ⇒ badge');
  assert.strictEqual(remoteAudioBadgeLabel('ok'), '', 'RAH-12: ok ⇒ no badge');
  assert.strictEqual(remoteAudioBadgeLabel('unknown'), '', 'RAH-12: unknown ⇒ no badge');
  assert.strictEqual(remoteAudioBadgeLabel('ok', true), '', 'RAH-12: ok+micSilent ⇒ still no badge');
  assert.strictEqual(remoteAudioBadgeLabel('unknown', true), '', 'RAH-12: unknown+micSilent ⇒ no badge');
}

console.log('remote-audio-health: all assertions passed');
