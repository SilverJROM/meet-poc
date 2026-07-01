import assert from 'node:assert/strict';
import { shouldBindSubscribeResponse } from './sfu-recovery-epoch.js';

// BUG-REPRO-R1-epoch-guard — stale in-flight subscribe after recovery epoch bump must not bind.
// PASSES today (guard contract). B2 coordinator will wire this; test flips when epoch guard is integrated end-to-end.
{
  const bind = shouldBindSubscribeResponse({
    capturedRecoveryEpoch: 1,
    currentRecoveryEpoch: 2,
    inFlightPublisherClientId: 'alice',
    inFlightPublisherCfSessionId: 'old-cf',
    currentPublisher: { clientId: 'alice', cfSessionId: 'new-cf' },
  });
  assert.equal(bind, false, 'BUG-REPRO-R1-epoch-guard: epoch bump blocks stale subscribe bind');
}

// BUG-REPRO-R1-epoch-guard — matching epoch + current publisher session still allows bind.
{
  const bind = shouldBindSubscribeResponse({
    capturedRecoveryEpoch: 3,
    currentRecoveryEpoch: 3,
    inFlightPublisherClientId: 'alice',
    inFlightPublisherCfSessionId: 'live-cf',
    currentPublisher: { clientId: 'alice', cfSessionId: 'live-cf' },
  });
  assert.equal(bind, true, 'BUG-REPRO-R1-epoch-guard: same epoch and cfSession may bind');
}

// BUG-REPRO-R1-epoch-guard — cfSession drift blocks bind even when epoch matches (SFU-R4 complement).
{
  const bind = shouldBindSubscribeResponse({
    capturedRecoveryEpoch: 4,
    currentRecoveryEpoch: 4,
    inFlightPublisherClientId: 'alice',
    inFlightPublisherCfSessionId: 'old-cf',
    currentPublisher: { clientId: 'alice', cfSessionId: 'new-cf' },
  });
  assert.equal(bind, false, 'BUG-REPRO-R1-epoch-guard: cfSession drift blocks bind');
}

console.log('sfu-recovery-epoch: all assertions passed');