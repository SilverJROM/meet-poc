import assert from 'node:assert/strict';
import {
  applyPresenceUpdate,
  applyRosterSnapshot,
  planInitialPublishRetry,
  planSfuTransportRecovery,
  planSubscribeRetry,
  removeFromRoster,
  selectNewRemoteTracks,
  shouldRegisterFirstAddedLocalTrack,
} from './sfu-roster-utils.js';
import type { RemotePublisher } from './sfu-roster-utils.js';
import { reconcileSubscribedMids } from './sfu-mid-reconcile.js';

function makePublisher(clientId: string, revision: number): RemotePublisher {
  return { clientId, participantId: `p-${clientId}`, cfSessionId: `cf-${clientId}`, tracks: [], revision };
}

function makeTransceivers(entries: { mid: string; receiverKind: string }[]): RTCRtpTransceiver[] {
  return entries.map((entry) => ({ mid: entry.mid, receiver: { track: { kind: entry.receiverKind } } })) as unknown as RTCRtpTransceiver[];
}

// applyPresenceUpdate — applies a newer revision
{
  const empty = new Map<string, RemotePublisher>();
  const update = makePublisher('alice', 1);
  const next = applyPresenceUpdate(empty, update);
  assert.notEqual(next, empty, 'should return a new map when adding new entry');
  assert.deepEqual(next.get('alice'), update, 'entry should be stored');
}

// applyPresenceUpdate — rejects an equal revision (stale)
{
  const initial = new Map([['alice', makePublisher('alice', 5)]]);
  const stale = makePublisher('alice', 5);
  stale.cfSessionId = 'cf-stale';
  const next = applyPresenceUpdate(initial, stale);
  assert.equal(next, initial, 'should return the same map for equal revision (no change)');
  assert.equal(next.get('alice')?.cfSessionId, 'cf-alice', 'stale entry must not overwrite current');
}

// applyPresenceUpdate — rejects an older revision (stale)
{
  const initial = new Map([['alice', makePublisher('alice', 10)]]);
  const older = makePublisher('alice', 7);
  const next = applyPresenceUpdate(initial, older);
  assert.equal(next, initial, 'should return the same map for older revision');
  assert.equal(next.get('alice')?.revision, 10, 'revision must not regress');
}

// applyPresenceUpdate — applies a strictly newer revision
{
  const initial = new Map([['alice', makePublisher('alice', 3)]]);
  const newer = { ...makePublisher('alice', 4), cfSessionId: 'cf-alice-new' };
  const next = applyPresenceUpdate(initial, newer);
  assert.notEqual(next, initial, 'should return a new map for newer revision');
  assert.equal(next.get('alice')?.revision, 4, 'revision should be updated');
  assert.equal(next.get('alice')?.cfSessionId, 'cf-alice-new', 'entry should be updated');
}

// applyRosterSnapshot — replaces the map entirely
{
  const initial = new Map([['alice', makePublisher('alice', 1)]]);
  const snapshot = [makePublisher('bob', 2), makePublisher('carol', 3)];
  const next = applyRosterSnapshot(snapshot);
  assert.equal(next.has('alice'), false, 'old entries should not carry over');
  assert.equal(next.has('bob'), true);
  assert.equal(next.has('carol'), true);
  assert.equal(next.get('bob')?.revision, 2);
}

// applyRosterSnapshot — empty snapshot produces empty map
{
  const next = applyRosterSnapshot([]);
  assert.equal(next.size, 0);
}

// removeFromRoster — deletes an existing entry
{
  const initial = new Map([['alice', makePublisher('alice', 1)], ['bob', makePublisher('bob', 2)]]);
  const next = removeFromRoster(initial, 'alice');
  assert.notEqual(next, initial, 'should return a new map when deleting');
  assert.equal(next.has('alice'), false, 'alice should be removed');
  assert.equal(next.has('bob'), true, 'bob should remain');
}

// removeFromRoster — no-op for unknown clientId (same map reference)
{
  const initial = new Map([['alice', makePublisher('alice', 1)]]);
  const next = removeFromRoster(initial, 'nobody');
  assert.equal(next, initial, 'should return the same map when entry does not exist');
}

// shouldRegisterFirstAddedLocalTrack — late video after camera-off join registers once
{
  const tracks = [{ trackName: 'p1:1:audio:a1', kind: 'audio', mid: '0', status: 'live' as const }];
  assert.equal(shouldRegisterFirstAddedLocalTrack(tracks, 'video', true), true, 'first live video must register');
}

// shouldRegisterFirstAddedLocalTrack — late audio after publishing without mic registers once
{
  const tracks = [{ trackName: 'p1:1:video:v1', kind: 'video', mid: '1', status: 'live' as const }];
  assert.equal(shouldRegisterFirstAddedLocalTrack(tracks, 'audio', true), true, 'first live audio must register');
}

// shouldRegisterFirstAddedLocalTrack — normal on-join replacements do not re-register
{
  const tracks = [
    { trackName: 'p1:1:audio:a1', kind: 'audio', mid: '0', status: 'live' as const },
    { trackName: 'p1:1:video:v1', kind: 'video', mid: '1', status: 'live' as const },
  ];
  assert.equal(shouldRegisterFirstAddedLocalTrack(tracks, 'audio', true), false, 'existing live audio must not re-register');
  assert.equal(shouldRegisterFirstAddedLocalTrack(tracks, 'video', true), false, 'existing live video must not re-register');
}

// shouldRegisterFirstAddedLocalTrack — null sender tracks never register
{
  assert.equal(shouldRegisterFirstAddedLocalTrack([], 'audio', false), false, 'null audio sender must not register');
  assert.equal(shouldRegisterFirstAddedLocalTrack([], 'video', false), false, 'null video sender must not register');
}

// planSubscribeRetry — stuck subscribe with no first frame retries with bounded backoff
{
  const retry = planSubscribeRetry({ currentAttempts: 0, cap: 7, hasFirstFrame: false, baseBackoffMs: 250, maxBackoffMs: 4000 });
  assert.equal(retry.shouldRetry, true, 'stuck subscribe should retry when no first frame arrived');
  assert.equal(retry.nextAttempts, 1, 'first stuck retry should record attempt 1');
  assert.equal(retry.backoffMs, 250, 'first stuck retry should use base backoff');
  assert.equal(retry.capped, false, 'first stuck retry should not be capped');
}

// planSubscribeRetry — cap is respected at the final allowed retry
{
  const retry = planSubscribeRetry({ currentAttempts: 6, cap: 7, hasFirstFrame: false, baseBackoffMs: 250, maxBackoffMs: 4000 });
  assert.equal(retry.shouldRetry, true, 'attempt 7 is the last allowed retry');
  assert.equal(retry.nextAttempts, 7, 'attempt count should advance to the cap');
  assert.equal(retry.backoffMs, 4000, 'backoff should be capped at maxBackoffMs');
}

// planSubscribeRetry — healthy first-frame path does not retry
{
  const retry = planSubscribeRetry({ currentAttempts: 3, cap: 7, hasFirstFrame: true, baseBackoffMs: 250, maxBackoffMs: 4000 });
  assert.equal(retry.shouldRetry, false, 'healthy first frame must not schedule retry');
  assert.equal(retry.nextAttempts, 3, 'healthy path must not increment retry attempts');
  assert.equal(retry.backoffMs, null, 'healthy path has no backoff');
  assert.equal(retry.reason, 'healthy', 'healthy path should be identified explicitly');
}

// planSubscribeRetry — capped subscribe does not retry or create a storm
{
  const retry = planSubscribeRetry({ currentAttempts: 7, cap: 7, hasFirstFrame: false, baseBackoffMs: 250, maxBackoffMs: 4000 });
  assert.equal(retry.shouldRetry, false, 'capped subscribe must stop retrying');
  assert.equal(retry.nextAttempts, 8, 'capped attempt should still be recorded for logging');
  assert.equal(retry.backoffMs, null, 'capped subscribe must not schedule a backoff');
  assert.equal(retry.capped, true, 'capped subscribe should report capped');
}

// planInitialPublishRetry — success does not retry and is the only announce path
{
  const retry = planInitialPublishRetry({ published: true, failedAttempt: 0, cap: 3, retryableFailure: true, baseBackoffMs: 500, maxBackoffMs: 2000 });
  assert.equal(retry.outcome, 'success');
  assert.equal(retry.shouldRetry, false, 'successful publish must not retry');
  assert.equal(retry.shouldAnnounce, true, 'successful publish is allowed to announce');
  assert.equal(retry.backoffMs, null, 'successful publish has no backoff');
}

// planInitialPublishRetry — retryable failures retry until cap
{
  const first = planInitialPublishRetry({ published: false, failedAttempt: 1, cap: 3, retryableFailure: true, baseBackoffMs: 500, maxBackoffMs: 2000 });
  const second = planInitialPublishRetry({ published: false, failedAttempt: 2, cap: 3, retryableFailure: true, baseBackoffMs: 500, maxBackoffMs: 2000 });
  assert.equal(first.shouldRetry, true, 'first retryable failure should retry');
  assert.equal(first.nextAttempt, 2, 'first retry advances to attempt 2');
  assert.equal(first.backoffMs, 500, 'first retry uses base backoff');
  assert.equal(first.shouldAnnounce, false, 'intermediate retry must not announce');
  assert.equal(second.shouldRetry, true, 'second retryable failure should retry');
  assert.equal(second.nextAttempt, 3, 'second retry advances to final attempt');
  assert.equal(second.backoffMs, 1000, 'second retry doubles backoff');
  assert.equal(second.shouldAnnounce, false, 'second intermediate retry must not announce');
}

// planInitialPublishRetry — capped failure moves to after-cap state
{
  const retry = planInitialPublishRetry({ published: false, failedAttempt: 3, cap: 3, retryableFailure: true, baseBackoffMs: 500, maxBackoffMs: 2000 });
  assert.equal(retry.outcome, 'after-cap', 'cap should surface after-cap state');
  assert.equal(retry.shouldRetry, false, 'capped publish must not retry');
  assert.equal(retry.shouldAnnounce, false, 'capped publish must not announce');
  assert.equal(retry.reason, 'capped', 'capped publish should report capped reason');
}

// planInitialPublishRetry — permanent failure goes straight to after-cap state
{
  const retry = planInitialPublishRetry({ published: false, failedAttempt: 1, cap: 3, retryableFailure: false, baseBackoffMs: 500, maxBackoffMs: 2000 });
  assert.equal(retry.outcome, 'after-cap', 'permanent failure should surface action state immediately');
  assert.equal(retry.shouldRetry, false, 'permanent failure must not burn retries');
  assert.equal(retry.shouldAnnounce, false, 'permanent failure must not announce');
  assert.equal(retry.reason, 'permanent', 'permanent failure should report permanent reason');
}

// planSfuTransportRecovery — failed transport recovers immediately
{
  const recovery = planSfuTransportRecovery({
    connectionState: 'failed',
    iceConnectionState: 'failed',
    disconnectedElapsedMs: null,
    disconnectedGraceMs: 8000,
    currentAttempts: 0,
    cap: 3,
    baseBackoffMs: 500,
    maxBackoffMs: 2000,
  });
  assert.equal(recovery.action, 'recover', 'failed transport should trigger recovery');
  assert.equal(recovery.nextAttempts, 1, 'first failed recovery records attempt 1');
  assert.equal(recovery.backoffMs, 0, 'first failed recovery should run immediately');
  assert.equal(recovery.reason, 'failed');
}

// planSfuTransportRecovery — disconnected inside grace waits
{
  const recovery = planSfuTransportRecovery({
    connectionState: 'disconnected',
    iceConnectionState: 'disconnected',
    disconnectedElapsedMs: 2500,
    disconnectedGraceMs: 8000,
    currentAttempts: 0,
    cap: 3,
  });
  assert.equal(recovery.action, 'wait', 'brief disconnected state should wait for grace');
  assert.equal(recovery.nextAttempts, 0, 'waiting inside grace must not burn attempts');
  assert.equal(recovery.reason, 'disconnected-grace');
}

// planSfuTransportRecovery — connected resets pending disconnected/retry state
{
  const recovery = planSfuTransportRecovery({
    connectionState: 'connected',
    iceConnectionState: 'connected',
    disconnectedElapsedMs: 4000,
    disconnectedGraceMs: 8000,
    currentAttempts: 2,
    cap: 3,
  });
  assert.equal(recovery.action, 'reset', 'connected transport should cancel pending recovery state');
  assert.equal(recovery.nextAttempts, 0, 'connected transport resets attempts');
  assert.equal(recovery.backoffMs, null);
  assert.equal(recovery.reason, 'connected');
}

// planSfuTransportRecovery — disconnected after grace uses bounded backoff and caps
{
  const second = planSfuTransportRecovery({
    connectionState: 'disconnected',
    iceConnectionState: 'checking',
    disconnectedElapsedMs: 8500,
    disconnectedGraceMs: 8000,
    currentAttempts: 1,
    cap: 3,
    baseBackoffMs: 500,
    maxBackoffMs: 2000,
  });
  const capped = planSfuTransportRecovery({
    connectionState: 'failed',
    iceConnectionState: 'failed',
    disconnectedElapsedMs: null,
    disconnectedGraceMs: 8000,
    currentAttempts: 3,
    cap: 3,
    baseBackoffMs: 500,
    maxBackoffMs: 2000,
  });
  assert.equal(second.action, 'recover', 'expired disconnected state should recover');
  assert.equal(second.nextAttempts, 2, 'second recovery advances attempts');
  assert.equal(second.backoffMs, 500, 'second recovery uses base backoff');
  assert.equal(second.reason, 'disconnected-expired');
  assert.equal(capped.action, 'capped', 'recovery stops after cap');
  assert.equal(capped.nextAttempts, 4, 'capped attempt is recorded for diagnostics');
  assert.equal(capped.backoffMs, null, 'capped recovery must not schedule backoff');
}

// selectNewRemoteTracks — partial subscribe covers added audio/video/screen and skips existing names
{
  const previousTracks = [{ trackName: 'p1:1:audio:a1', kind: 'audio' }];
  const nextTracks = [
    { trackName: 'p1:1:audio:a1', kind: 'audio' },
    { trackName: 'p1:2:video:v1', kind: 'video' },
    { trackName: 'p1:3:screen:s1', kind: 'screen' },
    { trackName: 'p1:4:audio:a2', kind: 'audio' },
  ];
  const result = selectNewRemoteTracks(previousTracks, nextTracks, new Set(['p1:4:audio:a2']));
  assert.deepEqual(
    result.map((track) => track.trackName),
    ['p1:2:video:v1', 'p1:3:screen:s1'],
    'new remote tracks should include video and screen but skip already-subscribed audio',
  );
}

// selectNewRemoteTracks — repeat presence update does not double-subscribe an existing track
{
  const previousTracks = [
    { trackName: 'p1:1:audio:a1', kind: 'audio' },
    { trackName: 'p1:2:video:v1', kind: 'video' },
  ];
  const nextTracks = [...previousTracks];
  assert.deepEqual(selectNewRemoteTracks(previousTracks, nextTracks, new Set()).map((track) => track.trackName), []);
}

// reconcileSubscribedMids — audio+video both mid:"" (duplicate-key collision case)
{
  const responseTracks = [
    { trackName: 'p1:1:audio:a1', mid: '' },
    { trackName: 'p1:1:video:v1', mid: '' },
  ];
  const newTransceiverMids = ['2', '3'];
  const transceivers = makeTransceivers([
    { mid: '2', receiverKind: 'audio' },
    { mid: '3', receiverKind: 'video' },
  ]);
  const kindMap = new Map([['p1:1:audio:a1', 'audio'], ['p1:1:video:v1', 'video']]);
  const result = reconcileSubscribedMids(responseTracks, newTransceiverMids, transceivers, kindMap, 'client-a');
  assert.equal(result.length, 2, 'both tracks should be reconciled');
  assert.equal(result[0].realMid, '2', 'audio gets first new transceiver mid');
  assert.equal(result[0].kind, 'audio', 'audio kind correct');
  assert.equal(result[0].trackName, 'p1:1:audio:a1', 'audio trackName preserved');
  assert.equal(result[0].publisherClientId, 'client-a', 'publisherClientId set');
  assert.equal(result[1].realMid, '3', 'video gets second new transceiver mid');
  assert.equal(result[1].kind, 'video', 'video kind correct');
  assert.equal(result[1].trackName, 'p1:1:video:v1', 'video trackName preserved');
}

// reconcileSubscribedMids — single track (screen only), no collision
{
  const responseTracks = [{ trackName: 'p2:1:screen:s1', mid: '' }];
  const newTransceiverMids = ['7'];
  const transceivers = makeTransceivers([{ mid: '7', receiverKind: 'video' }]);
  const kindMap = new Map([['p2:1:screen:s1', 'screen']]);
  const result = reconcileSubscribedMids(responseTracks, newTransceiverMids, transceivers, kindMap, 'client-b');
  assert.equal(result.length, 1);
  assert.equal(result[0].realMid, '7');
  assert.equal(result[0].kind, 'screen');
}

console.log('sfu-client roster utils: all assertions passed');
