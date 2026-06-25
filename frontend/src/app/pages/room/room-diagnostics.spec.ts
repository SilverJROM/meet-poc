import assert from 'node:assert/strict';
import { collectWithTimeout, DiagnosticsPostGate } from './room-diagnostics';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

{
  const gate = new DiagnosticsPostGate(5);
  let posts = 0;

  const first = await gate.run(() => new Promise<void>(() => undefined));
  assert.equal(first, 'timeout', 'hung diagnostics post times out instead of owning the gate forever');

  for (let i = 0; i < 30; i += 1) {
    const result = await gate.run(async () => {
      posts += 1;
    });
    assert.equal(result, 'posted', `post ${i + 1} after timeout is accepted`);
  }
  assert.equal(posts, 30, 'diagnostics posting has no first-window sample cap after a hung request clears');
}

{
  const gate = new DiagnosticsPostGate(20);
  const pending = gate.run(() => delay(10).then(() => undefined));
  assert.equal(await gate.run(async () => undefined), 'busy', 'overlapping diagnostics post is skipped while the current post is active');
  assert.equal(await pending, 'posted', 'active post still completes');
  assert.equal(await gate.run(async () => undefined), 'posted', 'gate reopens after active post completes');
}

{
  const timedOut = await collectWithTimeout(() => new Promise<null>(() => undefined), 5);
  assert.equal(timedOut, undefined, 'hung diagnostics collection is skipped for this tick only');

  const recovered = await collectWithTimeout(async () => ({ status: 'ok' }), 5);
  assert.deepEqual(recovered, { status: 'ok' }, 'later diagnostics collection still emits after a hung collect timeout');
}

console.log('room-diagnostics: all assertions passed');
