import assert from 'node:assert/strict';
import {
  runMicSweep,
  nextSweepGate,
  orderedMicCandidates,
  type SweepHooks,
  type SweepResult,
} from './mic-energy.js';

// ---------------------------------------------------------------------------
// B2c — multi-device microphone fallback (R10). Pure-function proof (NS5) for
// the sweep orchestrator + the one-sweep-per-episode gate + the candidate
// builder. Framework-free: node/tsx-runnable with injected hooks. Mirrors the
// behavioral assertions in validation/B2c/scenarios.md, mapped to the actual
// exported signatures (runMicSweep(originalDeviceId, hooks) /
// nextSweepGate(swept, classification, micActive) / orderedMicCandidates).
// ---------------------------------------------------------------------------

type AcquireFn = (deviceId: string) => Promise<{ deviceId: string; label?: string } | null>;
type ClassifyFn = () => Promise<'silent' | 'working' | 'indeterminate'>;

// A tiny harness that models the NON-DESTRUCTIVE replaceAudioTrack contract: at
// most ONE live track at a time, swapped on a successful acquire, KEPT on a
// null/throw. liveCount/maxObserved let us assert the never-zero invariant.
function makeHooks(opts: {
  candidates: { deviceId: string; label?: string }[];
  acquire: AcquireFn;
  classify: ClassifyFn;
  initialLiveDeviceId?: string;
  gatesSeq?: { micEnabled: boolean; micUnmuted: boolean; hasLiveAudioTrack: boolean }[];
}): {
  hooks: SweepHooks;
  acquireCalls: string[];
  classifyCalls: number;
  liveCount: () => number;
  minObserved: () => number;
} {
  const acquireCalls: string[] = [];
  let classifyCalls = 0;
  let live = 1; // a published track is already live when a silence episode begins
  let liveDeviceId = opts.initialLiveDeviceId ?? '';
  let minObserved = live;
  let gateIdx = 0;

  const hooks: SweepHooks = {
    candidates: opts.candidates,
    gates: () => {
      if (opts.gatesSeq) {
        const g = opts.gatesSeq[Math.min(gateIdx, opts.gatesSeq.length - 1)];
        gateIdx += 1;
        return g;
      }
      return { micEnabled: true, micUnmuted: true, hasLiveAudioTrack: true };
    },
    acquire: async (deviceId) => {
      acquireCalls.push(deviceId);
      let result: { deviceId: string; label?: string } | null;
      try {
        result = await opts.acquire(deviceId);
      } catch (err) {
        // Non-destructive: replaceAudioTrack throwing keeps the OLD track live.
        minObserved = Math.min(minObserved, live);
        throw err;
      }
      if (result) {
        // Success: new track live, old stopped -> still exactly one.
        liveDeviceId = result.deviceId;
      }
      // null: old track kept -> count unchanged. Either way count stays >= 1.
      minObserved = Math.min(minObserved, live);
      return result;
    },
    classifyCurrent: async () => {
      classifyCalls += 1;
      return opts.classify();
    },
    currentLiveDeviceId: () => liveDeviceId,
  };

  return {
    hooks,
    acquireCalls,
    get classifyCalls() {
      return classifyCalls;
    },
    liveCount: () => live,
    minObserved: () => minObserved,
  } as any;
}

// ===========================================================================
// AC-C2 / AC-C3 — sweep adopts the FIRST working candidate, stops on success
// ===========================================================================

// scenarios U-4 — first candidate silent, SECOND working ⇒ adopt the second, stop.
{
  let n = 0;
  const h = makeHooks({
    candidates: [{ deviceId: 'mic-B', label: 'USB Mic' }, { deviceId: 'mic-C', label: 'Webcam Mic' }],
    acquire: async (id) => ({ deviceId: id, label: id === 'mic-B' ? 'USB Mic' : 'Webcam Mic' }),
    classify: async () => (++n === 1 ? 'silent' : 'working'),
  });
  const res = await runMicSweep('mic-A', h.hooks);
  assert.deepStrictEqual(res, { outcome: 'adopted', deviceId: 'mic-C', label: 'Webcam Mic' });
  assert.deepStrictEqual(h.acquireCalls, ['mic-B', 'mic-C'], 'tried B (silent) then C (working)');
}

// scenarios U-5 — first candidate working ⇒ adopt it, NEVER acquire later candidates.
{
  const h = makeHooks({
    candidates: [{ deviceId: 'mic-B', label: 'USB' }, { deviceId: 'mic-C', label: 'Cam' }],
    acquire: async (id) => ({ deviceId: id, label: id === 'mic-B' ? 'USB' : 'Cam' }),
    classify: async () => 'working',
  });
  const res = await runMicSweep('mic-A', h.hooks);
  assert.strictEqual(res.outcome, 'adopted');
  assert.strictEqual((res as Extract<SweepResult, { outcome: 'adopted' }>).deviceId, 'mic-B');
  assert.deepStrictEqual(h.acquireCalls, ['mic-B'], 'stopped on first success');
}

// scenarios U-12 — adopted result carries a string deviceId + non-empty label
// (the wiring needs both to persist + name the device).
{
  const h = makeHooks({
    candidates: [{ deviceId: 'mic-C', label: 'Webcam Mic' }],
    acquire: async (id) => ({ deviceId: id, label: 'Webcam Mic' }),
    classify: async () => 'working',
  });
  const res = await runMicSweep('mic-A', h.hooks);
  assert.strictEqual(res.outcome, 'adopted');
  const adopted = res as Extract<SweepResult, { outcome: 'adopted' }>;
  assert.strictEqual(typeof adopted.deviceId, 'string');
  assert.ok(adopted.label && adopted.label.length > 0, 'adopted result names the device');
}

// ===========================================================================
// AC-C4 — no candidate works ⇒ none-working + RESTORE original; never zero tracks
// ===========================================================================

// scenarios U-6 — every candidate silent ⇒ none-working, original restored last.
{
  const h = makeHooks({
    candidates: [{ deviceId: 'mic-B', label: 'B' }, { deviceId: 'mic-C', label: 'C' }],
    acquire: async (id) => ({ deviceId: id, label: id }),
    classify: async () => 'silent',
    initialLiveDeviceId: 'mic-C', // pretend we ended the sweep on the last candidate
  });
  const res = await runMicSweep('mic-A', h.hooks);
  assert.deepStrictEqual(res, { outcome: 'none-working', restoredDeviceId: 'mic-A' });
  assert.strictEqual(h.acquireCalls[h.acquireCalls.length - 1], 'mic-A', 'original restored last');
}

// scenarios U-7 / U-22 — never zero tracks: a live track is held at every acquire
// and at exit (the harness models the non-destructive single-live-track contract).
{
  const h = makeHooks({
    candidates: [{ deviceId: 'mic-B', label: 'B' }],
    acquire: async (id) => ({ deviceId: id, label: id }),
    classify: async () => 'silent',
    initialLiveDeviceId: 'mic-B',
  });
  await runMicSweep('mic-A', h.hooks);
  assert.ok(h.minObserved() >= 1, 'live track count never dropped to 0 across the sweep');
  assert.ok(h.liveCount() >= 1, 'a live track is held at exit');
}

// ===========================================================================
// AC-C7 — orchestrator robustness: throwing/null candidate is non-fatal
// ===========================================================================

// scenarios U-23 — a candidate whose acquire THROWS is skipped; sweep continues.
{
  const h = makeHooks({
    candidates: [{ deviceId: 'mic-B', label: 'B' }, { deviceId: 'mic-C', label: 'C' }],
    acquire: async (id) => {
      if (id === 'mic-B') throw new Error('OverconstrainedError');
      return { deviceId: id, label: id };
    },
    classify: async () => 'working',
  });
  const res = await runMicSweep('mic-A', h.hooks);
  assert.deepStrictEqual(res, { outcome: 'adopted', deviceId: 'mic-C', label: 'mic-C' });
}

// scenarios U-24 — a candidate whose acquire returns NULL is skipped; not classified.
{
  const h = makeHooks({
    candidates: [{ deviceId: 'mic-B', label: 'B' }, { deviceId: 'mic-C', label: 'C' }],
    acquire: async (id) => (id === 'mic-B' ? null : { deviceId: id, label: id }),
    classify: async () => 'working',
  });
  const res = await runMicSweep('mic-A', h.hooks);
  assert.deepStrictEqual(res, { outcome: 'adopted', deviceId: 'mic-C', label: 'mic-C' });
  assert.strictEqual(h.classifyCalls, 1, 'the null (mic-B) track was NOT classified');
}

// scenarios U-25 — ALL candidates throw/null ⇒ graceful none-working + restore.
{
  const h = makeHooks({
    candidates: [{ deviceId: 'mic-B', label: 'B' }, { deviceId: 'mic-C', label: 'C' }],
    acquire: async (id) => {
      if (id === 'mic-B') throw new Error('x');
      if (id === 'mic-C') return null;
      return { deviceId: id, label: id };
    },
    classify: async () => 'working',
  });
  const res = await runMicSweep('mic-A', h.hooks);
  assert.strictEqual(res.outcome, 'none-working');
  assert.strictEqual((res as Extract<SweepResult, { outcome: 'none-working' }>).restoredDeviceId, 'mic-A');
}

// Muted/disabled mid-sweep ⇒ 'aborted' (the gates() read flips a gate false).
{
  const h = makeHooks({
    candidates: [{ deviceId: 'mic-B', label: 'B' }, { deviceId: 'mic-C', label: 'C' }],
    acquire: async (id) => ({ deviceId: id, label: id }),
    classify: async () => 'silent',
    // first iteration: eligible (try mic-B, still silent); second iteration: muted.
    gatesSeq: [
      { micEnabled: true, micUnmuted: true, hasLiveAudioTrack: true },
      { micEnabled: true, micUnmuted: false, hasLiveAudioTrack: true },
    ],
  });
  const res = await runMicSweep('mic-A', h.hooks);
  assert.deepStrictEqual(res, { outcome: 'aborted' }, 'muted mid-sweep aborts');
}

// ===========================================================================
// AC-C6 — bounded to ONE sweep per episode (gate reducer)
// ===========================================================================

// scenarios U-15 — first SILENT poll consumes one sweep; second silent poll does NOT re-sweep.
{
  let g = nextSweepGate(false, 'silent', true);
  assert.deepStrictEqual(g, { swept: true, shouldSweep: true }, 'first silent -> sweep consumed');
  g = nextSweepGate(g.swept, 'silent', true);
  assert.deepStrictEqual(g, { swept: true, shouldSweep: false }, 'second silent -> no re-sweep');
}

// scenarios U-16 — energy RETURNS ('working') then DROPS ('silent') ⇒ a NEW sweep allowed.
{
  let g = nextSweepGate(true, 'working', true);
  assert.deepStrictEqual(g, { swept: false, shouldSweep: false }, 'working -> re-arm');
  g = nextSweepGate(g.swept, 'silent', true);
  assert.deepStrictEqual(g, { swept: true, shouldSweep: true }, 'new episode -> one sweep');
}

// scenarios U-17 — indeterminate poll ⇒ gate UNCHANGED, never sweeps.
{
  assert.deepStrictEqual(nextSweepGate(true, 'indeterminate', true), { swept: true, shouldSweep: false });
  assert.deepStrictEqual(nextSweepGate(false, 'indeterminate', true), { swept: false, shouldSweep: false });
}

// scenarios U-18 — muted/disabled (micActive=false) ⇒ disarmed, never sweeps.
{
  for (const k of ['silent', 'working', 'indeterminate'] as const) {
    const g = nextSweepGate(false, k, false);
    assert.strictEqual(g.shouldSweep, false, k);
    assert.strictEqual(g.swept, false, k);
  }
}

// scenarios U-19 — mute is a PAUSE, not a permanent consume: unmute + silent ⇒ a fresh sweep.
{
  let g = nextSweepGate(false, 'silent', false); // muted -> disarmed, NOT swept
  assert.strictEqual(g.swept, false);
  assert.strictEqual(g.shouldSweep, false);
  g = nextSweepGate(g.swept, 'silent', true); // unmuted, still silent -> one sweep
  assert.deepStrictEqual(g, { swept: true, shouldSweep: true });
}

// ===========================================================================
// AC-C7 — candidate hygiene: dedupe by deviceId AND groupId; current-first; skip failed/empty
// ===========================================================================

// scenarios U-20 — 'default'/'communications' aliases collapse to their physical
// groupId twin; the CURRENT device is FIRST; webcam appears once.
{
  const cands = orderedMicCandidates(
    'mic-A',
    [
      { deviceId: 'default', groupId: 'gB', label: 'Default - USB' },
      { deviceId: 'mic-B', groupId: 'gB', label: 'USB Mic' },
      { deviceId: 'communications', groupId: 'gB', label: 'Communications - USB' },
      { deviceId: 'mic-A', groupId: 'gA', label: 'Built-in' },
      { deviceId: 'mic-C', groupId: 'gC', label: 'Webcam' },
    ],
  );
  // current-first: mic-A leads; gB collapses to one; gC once. 3 candidates total.
  assert.strictEqual(cands[0].deviceId, 'mic-A', 'current device is first');
  const groups = cands.map((c) => c.groupId);
  assert.strictEqual(new Set(groups).size, groups.length, 'no duplicate physical group');
  assert.ok(groups.includes('gA') && groups.includes('gB') && groups.includes('gC'));
  // Exactly one gB entry — the 'default'/'communications'/'mic-B' aliases collapse
  // to a single physical group (first occurrence wins). Only ONE survives.
  assert.strictEqual(cands.filter((c) => c.groupId === 'gB').length, 1, 'gB collapsed to one');
  const gBSurvivor = cands.filter((c) => c.deviceId === 'default' || c.deviceId === 'communications' || c.deviceId === 'mic-B');
  assert.strictEqual(gBSurvivor.length, 1, 'exactly one of the gB aliases survives');
  assert.strictEqual(cands.length, 3, 'current + gB + gC');
}

// scenarios U-21 — an already-failed candidate is skipped (no re-try this episode).
{
  const cands = orderedMicCandidates(
    'mic-A',
    [
      { deviceId: 'mic-A', groupId: 'gA', label: 'A' },
      { deviceId: 'mic-B', groupId: 'gB', label: 'B' },
      { deviceId: 'mic-C', groupId: 'gC', label: 'C' },
    ],
    new Set(['mic-B']),
  );
  assert.ok(!cands.some((c) => c.deviceId === 'mic-B'), 'failed mic-B excluded');
  assert.ok(cands.some((c) => c.deviceId === 'mic-C'), 'mic-C retained');
}

// scenarios U-11 (builder half) — single-device machine (only the current mic):
// returns [current], so the sweep re-acquires current then goes terminal.
{
  const cands = orderedMicCandidates('mic-A', [{ deviceId: 'mic-A', groupId: 'g1', label: 'A' }]);
  assert.deepStrictEqual(
    cands.map((c) => c.deviceId),
    ['mic-A'],
    'single-device -> [current]',
  );
}

// Empty deviceIds are dropped by the builder.
{
  const cands = orderedMicCandidates(
    'mic-A',
    [
      { deviceId: 'mic-A', groupId: 'gA', label: 'A' },
      { deviceId: '', groupId: 'gX', label: 'phantom' },
      { deviceId: 'mic-B', groupId: 'gB', label: 'B' },
    ],
  );
  assert.ok(!cands.some((c) => c.deviceId === ''), 'empty deviceId dropped');
}

console.log('mic-sweep: all assertions passed');
