import assert from 'node:assert/strict';
import { applyPresenceUpdate, applyRosterSnapshot, removeFromRoster } from './sfu-roster-utils.js';
import type { RemotePublisher } from './sfu-roster-utils.js';
import { reconcileSubscribedMids } from './sfu-mid-reconcile.js';

function makePublisher(clientId: string, revision: number): RemotePublisher {
  return { clientId, participantId: `p-${clientId}`, cfSessionId: `cf-${clientId}`, tracks: [], revision };
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

// reconcileSubscribedMids — audio+video both mid:"" (duplicate-key collision case)
{
  const responseTracks = [
    { trackName: 'p1:1:audio:a1', mid: '' },
    { trackName: 'p1:1:video:v1', mid: '' },
  ];
  const newTransceiverMids = ['2', '3'];
  const kindMap = new Map([['p1:1:audio:a1', 'audio'], ['p1:1:video:v1', 'video']]);
  const result = reconcileSubscribedMids(responseTracks, newTransceiverMids, kindMap, 'client-a');
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
  const kindMap = new Map([['p2:1:screen:s1', 'screen']]);
  const result = reconcileSubscribedMids(responseTracks, newTransceiverMids, kindMap, 'client-b');
  assert.equal(result.length, 1);
  assert.equal(result[0].realMid, '7');
  assert.equal(result[0].kind, 'screen');
}

console.log('sfu-client roster utils: all assertions passed');
